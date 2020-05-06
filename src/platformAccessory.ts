import { CharacteristicEventTypes } from 'homebridge';
import type { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback} from 'homebridge';

import { RaritanHomebridgePlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class RaritanPlatformAccessory {
  private service: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private exampleStates = {
    On: false,
    Brightness: 100,
  }

  constructor(
    private readonly platform: RaritanHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.services = [];

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, this.acessory.context.device.manufacturer)
      .setCharacteristic(this.platform.Characteristic.Model, this.acessory.context.device.model)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.acessory.context.device.firmware);
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.acessory.context.device.serial);

    for (var i = 0; i < this.acessory.context.device.count; i++) {
    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
      var serviceName = "Outlet ${i}";
      this.log.info('serviceName for ${i}', serviceName);
      var service = this.accessory.getService(this.platform.Service.Outlet, serviceName) ?? this.accessory.addService(this.platform.Service.Outlet, serviceName, i);
    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');


//      var service = new Service.Outlet(`Outlet ${i}`, i);

      // register handlers for the On/Off Characteristic
      this.services.push(service);
      service.getCharacteristic(this.platform.Characteristic.On)
        .on(CharacteristicEventTypes.SET,, this.setOn.bind(this, i))                // SET - bind to the `setOn` method below
        .on(CharacteristicEventTypes.GET,, this.getOn.bind(this, i));               // GET - bind to the `getOn` method below
    }

    var service = new Service.LightSensor(this.name);
    service.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
      .on('get', this.getWatts.bind(this))
    this.services.push(service);

    this.snmp = snmp.createSession(this.acessory.context.device.ipAddress, this.acessory.context.device.snmpCommunity);
    this.snmp_get = promisify(this.snmp.get.bind(this.snmp));
    this.snmp_set = promisify(this.snmp.set.bind(this.snmp));

    var outlet_oids = [];
    for (var i = 0; i < this.acessory.context.device.count; i++) {
      outlet_oids.push(`1.3.6.1.4.1.13742.4.1.2.2.1.2.${i + 1}`);
    }
    var promises = [];
    for (var i = 0; i < outlet_oids.length; i += 2) {
      var slice = outlet_oids.slice(i, i + 2);
      promises.push(this.snmp_get(slice))
    }
    Promise.all(promises)
      .then(results => {
        var names = results
          .reduce((prev, current) => {
            return prev.concat(current);
          }, [])
          .map(varbind => {
            return varbind.value.toString().split(",")[0];
          });
        for (var i = 0; i < names.length; i++) {
          var name = names[i]
          service = this.services[i];
          service.displayName = name;
          service.setCharacteristic(Characteristic.Name, name);
        }
        this.log.info('Successfully loaded outlet names: ', names.join(', '));
      })
      .catch(error => {
        this.log.error(error.stack);
      });
      

=    // register handlers for the Brightness Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .on(CharacteristicEventTypes.SET, this.setBrightness.bind(this));       // SET - bind to the 'setBrightness` method below

    // EXAMPLE ONLY
    // Example showing how to update the state of a Characteristic asynchronously instead
    // of using the `on('get')` handlers.
    //
    // Here we change update the brightness to a random value every 5 seconds using 
    // the `updateCharacteristic` method.
/*    setInterval(() => {
      // assign the current brightness a random value between 0 and 100
      const currentBrightness = Math.floor(Math.random() * 100);

      // push the new value to HomeKit
      this.service.updateCharacteristic(this.platform.Characteristic.Brightness, currentBrightness);

      this.platform.log.debug('Pushed updated current Brightness state to HomeKit:', currentBrightness);
    }, 10000);
  }
*/
  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  setOn(index, on: CharacteristicValue, callback: CharacteristicGetCallback) {
    this.log.info(`Switching socket ${index} to ${on}.`);
    var switch_oid = `1.3.6.1.4.1.13742.4.1.2.2.1.3.${index + 1}`;
    var toggle = on ? 1 : 0;
    var snmp_parms = [
      {
        oid: switch_oid,
        type: snmp.ObjectType.Integer,
        value: toggle
      }
    ];
    this.snmp_set(snmp_parms)
      .then(() => {
        this.log.info(`Successfully switched socket ${index} to ${on}.`);
        callback(null);
      })
      .catch(error => {
        this.log.error(`Error switching socket ${index} to ${on}.`);
        callback(error);
      });
  }

//  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   * 
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   * 
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  getOn(index, callback: CharacteristicGetCallback) {
    this.log.info(`Retrieving socket ${index}.`);
    var switch_oids = [];
    switch_oids.push(`1.3.6.1.4.1.13742.4.1.2.2.1.3.${index + 1}`);
    this.snmp_get(switch_oids)
      .then(varbinds => {
        var on = varbinds[0].value == 1
        this.log.info(`Socket ${index} is ${on}.`);
        callback(null, on);
      })
      .catch(error => {
        this.log.info(`Error retrieving socket ${index} status.`);
        callback(error, null);
      });
  }

  async getWatts (callback: CharacteristicGetCallback) {
    var switch_oids = [];
    switch_oids.push(`1.3.6.1.4.1.13742.4.1.3.1.3.0`);
    this.snmp_get(switch_oids)
      .then(varbinds => {
        var watts = varbinds[0].value;
        this.log.info(`Calling getWatts`, watts);
        callback(null, watts);
      })
      .catch(error => {
        this.log.info(`Error retrieving socket ${index} status.`);
        callback(error, null);
      });
  }

}
