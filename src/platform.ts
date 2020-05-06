import { APIEvent } from 'homebridge';
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { RaritanPlatformAccessory } from './platformAccessory';

const count_oid = "1.3.6.1.4.1.13742.4.1.2.1.0";
const mfr_oid = "1.3.6.1.4.1.13742.4.1.1.13.0";
const model_oid = "1.3.6.1.4.1.13742.4.1.1.12.0";
const serial_oid = "1.3.6.1.4.1.13742.4.1.1.2.0";
const firmware_oid = "1.3.6.1.4.1.13742.4.1.1.1.0";

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class RaritanHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service = this.api.hap.Service;
  public readonly Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Restoring accessory from cache:', accessory.displayName);

    // create the accessory handler
    // this is imported from `platformAccessory.ts`
    new RaritanPlatformAccessory(this, accessory);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {

    // EXAMPLE ONLY
    // A real plugin you would discover accessories from the local network, cloud services
    // or a user-defined array in the platform config.
    const exampleDevices = [
      {
        ipAddress: '192.168.1.70',
        snmpCommunity: 'homelan'
        displayName: 'Lab PDU',
        manufacturer: '',
        model: '',
        firmware: '',
        serial: '',
        count:'',
      },
    ];

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of exampleDevices) {
    
      this.snmp = snmp.createSession(device.ipAddress, device.snmpCommunity);
      this.snmp_get = promisify(this.snmp.get.bind(this.snmp));
      this.snmp_get(characteristics_oids)
        .then(varbinds => {
          device.count = varbinds[0].value;
          device.manufacturer = varbinds[1].value;
          device.model = varbinds[2].value;
          device.serial = varbinds[3].value;
          device.firmware = varbinds[4].value;
          this.log.info(`There are ${device.count} outlets.`);
          this.log.info(`PDU manufacturer ${device.manufacturer}.`);
          this.log.info(`PDU model number ${device.model}.`);
          this.log.info(`PDU serial number ${device.serial}.`);
          this.log.info(`PDU firmware version ${device.firmware}.`);
        })
        .catch(error => {
          this.log.error(error.stack);
        });
      this.snmp.close();

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
        new RaritanPlatformAccessory(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

        // push into accessory cache
        this.accessories.push(accessory);

        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

  }
}
