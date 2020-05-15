# homebridge-platform-pdu
# Homebridge dynamic Platform Plugin for Raritan and APC PDUs
A [Raritan](https://www.raritan.com) PX-5475 and [APC](https://www.apc.com) AP7931 PDU plugin for
[Homebridge](https://github.com/nfarina/homebridge).  This creates one or more PDU accessories, each with multiple outlet services and a light meter service to report on current utilization in Watts.

This code is heavily based on the work of invliD's [homebridge-digipower-pdu](https://github.com/invliD/homebridge-digipower-pdu) accessory.

# Installation
Run these commands:

    % sudo npm install -g homebridge
    % sudo npm install -g homebridge-platform-raritanpdu


NB: If you install homebridge like this:

    sudo npm install -g --unsafe-perm homebridge

Then all subsequent installations must be like this:

    sudo npm install -g --unsafe-perm homebridge-platform-raritanpdu

# Configuration

Example platform config (needs to be added to the homebridge config.json):
 ...

		"platforms": [
        {
            "name": "LAB Platform PDU",
            "pdus": [
                {
                    "ipAddress": "192.168.1.70",
                    "snmpCommunity": "private"
                },
                {
                    "ipAddress": "192.168.1.75",
                    "snmpCommunity": "private"
                }
                
            ],
            "platform": "Raritan Platform PDU"
        }
      	]
 ...

### Config Explanation:

Field           						| Description
----------------------------|------------
**platform**   							| (required) Must always be "Platform PDU".
**name**										| (required) A name for HomeBridge to use to reference the platform.
**ip_address**  						| (required) The internal ip address of your PDU.
**snmp_community**  				| (required) The Write community string for your PDU.

# Supported Agents
The only tested Raritan PDU model for this plugin is the one that I have in my lab, the PX-5475, but others should work.
The only tested APC PDU model for this plugin is the one that I have in my lab, the AP7931.
This is accomplished using the [PX-PDU-MIB](https://d3b2us605ptvk2.cloudfront.net/download/PX/v1.5.13/PX-1.5.13-MIB.txt) & [APC PowerNet MIB v4.0.4](https://www.apc.com/shop/us/en/products/APC-PowerNet-MIB-v4-0-4/P-SFPMIB404).

The outlet count is grabbed from the PDU using SNMP, as are the Model, FirmwareRevision, SerialNumber & SNMP system name (used as a DisplayName).
