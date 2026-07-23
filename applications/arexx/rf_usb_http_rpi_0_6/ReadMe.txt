
rf_usb_http program for raspberry pi


Date February 22, 2016
Program version 0.6


The program reads data from a rf_usb device, and sends the data to a webserver or templogger via tcp/ip according to a rule file.

This program uses the libusb 1.0 library 
Make sure this is installed on the system 

Next, a udev rule file has to be added in order to set write access permissions to the rf_usb device.
For this purpose, place the file 51-rf_usb.rules in the /lib/udev/rules.d directory
Restart the udev service afterwards:
sudo service udev restart

The output of the program is the same as for the bs1000 messenger. It creates a http request for each new incoming measurement, according to the specification in the rulefile.
A rulefile can be created with the rule editor. The rule file is used as configuration input for the rf_usb_http program.
At this moment only one rule is processed. The ruletype is http-get or http-post, url encoded only.
The following tags are supported for output:
$q (sensor type), 
$i (sensor id), 
$S (UTC timestamp in seconds since 1-1-2000), 
$v (measurement value), 
$r (rssi value)
$w (missing time, not used but is equal to timestamp of measurement)
The program doesn't support the condition evaluation.

Use of the program:
rf_usb_http.elf [options] rulefile 

Options:
-v	verbose, shows additional info
rulefile points to a rulefile created by the rule editor. See the documentation on this program for more info. 
The example rulefile pushes data to a templogger instance on 192.168.0.62, port 49161

example:
./rf_usb_http.elf -v rulefile.txt

If a device.xml file is in the same directory as the executable, the tool will try to read and use these device definitions. Otherwise, the built-in list is used.


Changelog
Date February 22, 2016
Program version 0.6
- sensors with long id's now supported

Date November 28, 2015
Program version 0.5
- HTTP request stated Host to localhost instead of target

Date May 16, 2013
Program version 0.4
- Corrected malformed get request.
- Expanded post request to make it consumable for apache

Date March 13, 2013
Program version 0.3
- Adapted program for raspberry pi

Date February 21, 2011
Program version 0.2
- removed endless loop when an unknown measurement type arrives

Date October 21, 2010
Program version 0.1
- Initial version
