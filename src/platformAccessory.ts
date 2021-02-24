import { Service, CharacteristicEventTypes } from 'homebridge';
import type { PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback} from 'homebridge';

import { PduHomebridgePlatform } from './platform';
import {promisify} from 'es6-promisify';
import * as snmp from 'net-snmp';

const raritanOutletNamesOid = '1.3.6.1.4.1.13742.4.1.2.2.1.2';
const raritanOutletStatusOid = '1.3.6.1.4.1.13742.4.1.2.2.1.3';
const raritanPowerOid = '1.3.6.1.4.1.13742.4.1.3.1.3.0';
const raritanPowerMultiple = 1;
const raritanOff = 0;
const raritanOn = 1;
const apcOutletNamesOid = '1.3.6.1.4.1.318.1.1.12.3.5.1.1.2';
const apcOutletStatusOid = '1.3.6.1.4.1.318.1.1.12.3.3.1.1.4';
const apcPowerOid = '1.3.6.1.4.1.318.1.1.12.2.3.1.1.2.1';
const apcPowerMultiple = 11; // Convert tenths of Amps to Watts at 110V AC
const apcOff = 2;
const apcOn = 1;
const outletNameOids = [raritanOutletNamesOid,apcOutletNamesOid];
const outletStatusOids = [raritanOutletStatusOid,apcOutletStatusOid];
const powerOids = [raritanPowerOid,apcPowerOid];
const powerMultiples = [raritanPowerMultiple,apcPowerMultiple];
const statusOff = [raritanOff,apcOff];
const statusOn = [raritanOn,apcOn];

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class PduPlatformAccessory {
//private service: Service;
  private services: Service[] =[];

  public snmpSession: any;
  public snmpGet: any;
  public snmpSet: any;

  constructor(
    private readonly platform: PduHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ){

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, this.accessory.context.device.manufacturer)
      .setCharacteristic(this.platform.Characteristic.Model, this.accessory.context.device.model)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.accessory.context.device.firmware)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.device.serial);

    for (let i = 0; i < this.accessory.context.device.count; i++) {
      const serviceName = `Outlet ${i}`;
      this.platform.log.debug(this.accessory.context.device.displayName, 'serviceName for', i, serviceName);
      // get the LightBulb service if it exists, otherwise create a new LightBulb service
      // you can create multiple services for each accessory
      const iString = i.toString();
      const outletService = this.accessory.getService(iString) ?? this.accessory.addService(this.platform.Service.Outlet, serviceName, iString);
      // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
      // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
      // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');


      // register handlers for the On/Off Characteristic
      this.services.push(outletService);
      outletService.getCharacteristic(this.platform.Characteristic.On)
        .on(CharacteristicEventTypes.SET, this.setOn.bind(this, i))    // SET - bind to the `setOn` method below
        .on(CharacteristicEventTypes.GET, this.getOn.bind(this, i));   // GET - bind to the `getOn` method below
    }

    const lightService = this.accessory.getService(this.platform.Service.LightSensor) ?? this.accessory.addService(this.platform.Service.LightSensor, this.accessory.context.device.name);
    this.services.push(lightService);
    lightService.getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel)
      .on(CharacteristicEventTypes.GET, this.getWatts.bind(this));

    this.snmpSession = snmp.createSession(this.accessory.context.device.ipAddress, this.accessory.context.device.snmpCommunity);
    this.snmpGet = promisify(this.snmpSession.get.bind(this.snmpSession));
    this.snmpSet = promisify(this.snmpSession.set.bind(this.snmpSession));

    const outletOids = [];
    for (let i = 0; i < this.accessory.context.device.count; i++) {
			
      outletOids.push(`${outletNameOids[this.accessory.context.device.mfgIndex]}.${i + 1}`);
    }
    this.platform.log.debug(this.accessory.context.device.displayName, 'Outlet OIDs for names', outletOids);

    const promises = [];
    for (let i = 0; i < outletOids.length; i += 2) {
      const slice = outletOids.slice(i, i + 2);
      promises.push(this.snmpGet(slice));
    }

    interface VarbindType {
      oid: string;
      type: any;
      value: any;
    }
    
    Promise.all(promises)
      .then(results => {
        const names = results
          .reduce((prev, current) => {
            return prev.concat(current);
          }, [])
          .map((varbind: VarbindType) => {
            return varbind.value.toString().split(',')[0];
          });
        this.platform.log.debug(this.accessory.context.device.displayName, 'names=', names);
        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          this.platform.log.debug(this.accessory.context.device.displayName, `names ${i} =`, name);
          const service: Service = this.services[i];
          service.displayName = name;
          service.setCharacteristic(this.platform.Characteristic.Name, name);
        }
        this.platform.log.info(this.accessory.context.device.displayName, 'Successfully loaded outlet names: ', names.join(', '));
      })
      .catch(error => {
        this.platform.log.error(this.accessory.context.device.displayName, error.stack);
      });
  }

  // register handlers for the Brightness Characteristic --- I may modify this later
  /*    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .on(CharacteristicEventTypes.SET, this.setBrightness.bind(this));       // SET - bind to the 'setBrightness` method below
  */
  // EXAMPLE ONLY
  // Example showing how to update the state of a Characteristic asynchronously instead
  // of using the `on('get')` handlers.
  //
  // Here we change update the brightness to a random value every 5 seconds using 
  // the `updateCharacteristic` method.
  /* setInterval(() => {
  // assign the current brightness a random value between 0 and 100
      const currentBrightness = Math.floor(Math.random() * 100);

  // push the new value to HomeKit
      this.service.updateCharacteristic(this.platform.Characteristic.Brightness, currentBrightness);

      this.platform.log.debug('Pushed updated current Brightness state to HomeKit:', currentBrightness);
    }, 10000);
  }
*/

  async setOn(index: number, on: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug(this.accessory.context.device.displayName, `Switching socket ${index} to ${on}.`);
    const switchOid = `${outletStatusOids[this.accessory.context.device.mfgIndex]}.${index + 1}`;
    const toggle = on ? statusOn[this.accessory.context.device.mfgIndex] : statusOff[this.accessory.context.device.mfgIndex];
    const snmpParms = [
      {
        oid: switchOid,
        type: snmp.ObjectType.Integer,
        value: toggle,
      },
    ];
    this.snmpSet(snmpParms)
      .then(() => {
        this.platform.log.info(this.accessory.context.device.displayName, `Successfully switched socket ${index} to ${on}.`);
        callback(undefined);
      })
      .catch((err: Error) => {
        this.platform.log.error(this.accessory.context.device.displayName, `Error switching socket ${index} to ${on}.`);
        callback(err);

      });
  }

  async getOn(index: number, callback: CharacteristicSetCallback) {
    this.platform.log.debug(this.accessory.context.device.displayName, `Retrieving socket ${index}.`);
    interface VarbindType {
      oid: string;
      type: any;
      value: any;
    }
    const switchOids = [];
    switchOids.push(`${outletStatusOids[this.accessory.context.device.mfgIndex]}.${index + 1}`);
    this.snmpGet(switchOids)
      .then((varbinds: VarbindType[]) => {
        const on = varbinds[0].value === statusOn[this.accessory.context.device.mfgIndex]; 
        if (on) {     	
					this.platform.log.info(this.accessory.context.device.displayName, `Socket ${index} is ${on}.`);
        } else {
					this.platform.log.debug(this.accessory.context.device.displayName, `Socket ${index} is ${on}.`);
				}
        callback(undefined, on);
      })
      .catch((err: Error) => {
        this.platform.log.error(this.accessory.context.device.displayName, `Error retrieving socket ${index} status.`);
        callback(err, undefined);

      });
  }

  async getWatts (callback: CharacteristicSetCallback) {
    interface VarbindType {
      oid: string;
      type: any;
      value: any;
    }
    const switchOids = [];
    switchOids.push(`${powerOids[this.accessory.context.device.mfgIndex]}`);
    this.snmpGet(switchOids)
      .then((varbinds: VarbindType[]) => {
        const watts = varbinds[0].value * powerMultiples[this.accessory.context.device.mfgIndex];
        this.platform.log.info(this.accessory.context.device.displayName, 'Calling getWatts', watts);
        if (watts <= 0) { watts = 0.0001};
        callback(undefined, watts);
      })
      .catch((err: Error) => {
        this.platform.log.error(this.accessory.context.device.displayName, 'Error retrieving Watts.');
        callback(err, undefined);

      });
  }

}
