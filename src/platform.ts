import { APIEvent } from 'homebridge';
import type { API, Service, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { PduPlatformAccessory } from './platformAccessory';

import{promisify} from 'es6-promisify';
import * as snmp from 'net-snmp';

const sysDescrOid = ['1.3.6.1.2.1.1.1.0'];
const raritanCountOid = '1.3.6.1.4.1.13742.4.1.2.1.0';
const raritanNameOid = '1.3.6.1.2.1.1.5.0';
const raritanModelOid = '1.3.6.1.4.1.13742.4.1.1.12.0';
const raritanSerialOid = '1.3.6.1.4.1.13742.4.1.1.2.0';
const raritanFirmwareOid = '1.3.6.1.4.1.13742.4.1.1.1.0';
const apcCountOid = '1.3.6.1.4.1.318.1.1.12.1.8.0';
const apcNameOid = '1.3.6.1.4.1.318.1.1.12.1.1.0';
const apcModelOid = '1.3.6.1.4.1.318.1.1.12.1.5.0';
const apcSerialOid = '1.3.6.1.4.1.318.1.1.12.1.6.0';
const apcFirmwareOid = '1.3.6.1.4.1.318.1.1.12.1.2.0';

const knownManufacturers = ['Raritan', 'APC'];
const characteristicsOids = [[raritanCountOid,raritanNameOid,raritanModelOid,raritanSerialOid,raritanFirmwareOid],[apcCountOid,apcNameOid,apcModelOid,apcSerialOid,apcFirmwareOid]];

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class PduHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service = this.api.hap.Service;
  public readonly Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  private snmpSession: any;
  private snmpGet: any;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,

  ) {
      this.log.info('Finished initializing platform:', this.config.name);

      // When this event is fired it means Homebridge has restored all cached accessories from disk.
      // Dynamic Platform plugins should only register new accessories after this event was fired,
      // in order to ensure they weren't added to homebridge already. This event can also be used
      // to start discovery of new accessories.
      this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
        this.log.debug('Executed didFinishLaunching callback');
        // run the method to discover / register your devices as accessories
        this.discoverDevices();
      });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    if (this.config.pdus.find( (ipAddress: string) => ipAddress === accessory.context.device.ipAddress ))  {
			this.log.info('Restoring accessory from cache:', accessory.displayName);

			// create the accessory handler
			// this is imported from `platformAccessory.ts`
			new PduPlatformAccessory(this, accessory);

			// add the restored accessory to the accessories cache so we can track if it has already been registered
			this.accessories.push(accessory);
    }
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    interface VarbindType {
      oid: string;
      type: any;
      value: any;
    }

    // check for a blank config and return without registering accessories
		if (!this.config) {
			this.log.warn("Ignoring PDU Platform setup because it is not configured");
			return;
		}

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of this.config.pdus) {   
      const snmpSession = snmp.createSession(device.ipAddress, device.snmpCommunity);
      this.log.debug('Opened SNMP session.');
      const snmpGet = promisify(snmpSession.get.bind(snmpSession));
      snmpGet(sysDescrOid)
        .then((mfgVarbinds: VarbindType[]) => {
          this.log.debug('Manufacturer varbind returned', mfgVarbinds[0].value.toString());
          device.manufacturer = mfgVarbinds[0].value.toString().split(' ',1)[0];
          this.log.debug('device.manufacturer = ', device.manufacturer);
          const mfgIndex = knownManufacturers.indexOf(device.manufacturer);
					
          if (mfgIndex > -1) {
            device.mfgIndex = mfgIndex;
            snmpGet(characteristicsOids[mfgIndex])
              .then((varbinds: VarbindType[]) => {
                device.count = varbinds[0].value;
                device.displayName = varbinds[1].value.toString();
                device.model = varbinds[2].value.toString();
                device.serial = varbinds[3].value.toString();
                device.firmware = varbinds[4].value.toString();
                this.log.debug(`There are ${device.count} outlets.`);
                this.log.debug(`PDU name ${device.displayName}.`);
                this.log.debug(`PDU model number ${device.model}.`);
                this.log.debug(`PDU serial number ${device.serial}.`);
                this.log.debug(`PDU firmware version ${device.firmware}.`);
                snmpSession.close();

                // generate a unique id for the accessory this should be generated from
                // something globally unique, but constant, for example, the device serial
                // number or MAC address
                const uuid = this.api.hap.uuid.generate(device.serial);

                // check that the device has not already been registered by checking the
                // cached devices we stored in the `configureAccessory` method above
                if (!this.accessories.find(accessory => accessory.UUID === uuid)) {
                  this.log.info('Registering new accessory:', device.displayName);

                  // create a new accessory
                  const accessory = new this.api.platformAccessory(device.displayName, uuid);

                  // store a copy of the device object in the `accessory.context`
                  // the `context` property can be used to store any data about the accessory you may need
                  accessory.context.device = device;

                  // create the accessory handler
                  // this is imported from `platformAccessory.ts`
                  new PduPlatformAccessory(this, accessory);

                  // link the accessory to your platform
                  this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

                  // push into accessory cache
                  this.accessories.push(accessory);

                  // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
                  // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                }
              })
              .catch((err: Error) => {
                this.log.error('We hit an error trying to GET Characteristics OIDs');
                console.log(err.stack);
                snmpSession.close();
							

              })
            } else {
              this.log.error('Unknown PDU manufacturer',device.manufacturer);
              snmpSession.close();

            }
          })
          .catch((err: Error) => {
            this.log.error('We hit an error trying to GET Manufacturer OID');
            console.log(err.stack);
            snmpSession.close();

          });		
    }
  }
}
