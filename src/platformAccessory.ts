import { Service, CharacteristicEventTypes } from 'homebridge';
import type { PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback} from 'homebridge';

import { RaritanHomebridgePlatform } from './platform';
import {promisify} from 'es6-promisify';
import * as snmp from 'net-snmp';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class RaritanPlatformAccessory {
//private service: Service;
  private services: Service[] =[];

  public snmpSession: any;
  public snmpGet: any;
  public snmpSet: any;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   * --- I may modify this later...
   */
  /*  private exampleStates = {
    On: false,
    Brightness: 100,
  }
*/
  constructor(
    private readonly platform: RaritanHomebridgePlatform,
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
      this.platform.log.debug('serviceName for', i, serviceName);
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
      outletOids.push(`1.3.6.1.4.1.13742.4.1.2.2.1.2.${i + 1}`);
    }
    this.platform.log.debug('Outlet OIDs for names', outletOids);

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
        this.platform.log.debug('names=', names);
        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          this.platform.log.debug(`names ${i} =`, name);
          const service: Service = this.services[i];
          service.displayName = name;
          service.setCharacteristic(this.platform.Characteristic.Name, name);
        }
        this.platform.log.info('Successfully loaded outlet names: ', names.join(', '));
      })
      .catch(error => {
        this.platform.log.error(error.stack);
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
    this.platform.log.info(`Switching socket ${index} to ${on}.`);
    const switchOid = `1.3.6.1.4.1.13742.4.1.2.2.1.3.${index + 1}`;
    const toggle = on ? 1 : 0;
    const snmpParms = [
      {
        oid: switchOid,
        type: snmp.ObjectType.Integer,
        value: toggle,
      },
    ];
    this.snmpSet(snmpParms)
      .then(() => {
        this.platform.log.info(`Successfully switched socket ${index} to ${on}.`);
        callback(undefined);
      })
      .catch((err: Error) => {
        this.platform.log.error(`Error switching socket ${index} to ${on}.`);
        callback(err);

      });
  }

  async getOn(index: number, callback: CharacteristicSetCallback) {
    this.platform.log.info(`Retrieving socket ${index}.`);
    interface VarbindType {
      oid: string;
      type: any;
      value: any;
    }
    const switchOids = [];
    switchOids.push(`1.3.6.1.4.1.13742.4.1.2.2.1.3.${index + 1}`);
    this.snmpGet(switchOids)
      .then((varbinds: VarbindType[]) => {
        const on = varbinds[0].value === 1;
        this.platform.log.info(`Socket ${index} is ${on}.`);
        callback(undefined, on);
      })
      .catch((err: Error) => {
        this.platform.log.error(`Error retrieving socket ${index} status.`);
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
    switchOids.push('1.3.6.1.4.1.13742.4.1.3.1.3.0');
    this.snmpGet(switchOids)
      .then((varbinds: VarbindType[]) => {
        const watts = varbinds[0].value;
        this.platform.log.info('Calling getWatts', watts);
        callback(undefined, watts);
      })
      .catch((err: Error) => {
        this.platform.log.error('Error retrieving Watts.');
        callback(err, undefined);

      });
  }

}
