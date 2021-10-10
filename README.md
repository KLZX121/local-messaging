## Local Messaging
A simple messaging app for use over local networks.

The main purpose of this app is for use on networks that have blocked social media sites, such as school WiFi. As the app hosts a server locally on the host's computer, it bypassess all restrictions on the network. The app is placed on your [system tray](#additional-information), so you can hide the app without it quitting. 

**Use the most updated version of the app for optimal performance**

Note: The setup file will trigger firewalls and warnings as the code is unsigned - it is perfectly safe to download (all the code is here on GitHub)
### Hosting
Press the `Host Server` button under the chatbox, and change your desired host settings. A server will be automatically created on IP address on port 121.

Your host address will be displayed on the top of the app, which will allow other people to connect to the server if they are manually connecting.

### Connecting
You can only connect to servers that are on the same WiFi network as you.  
There are three ways to connect to a server:
* ##### Scan for open servers on the network
    This option should be used when you **do not know the IP address** of the server you are connecting to, or are just browsing for open servers.

    There are two different search methods:
    
    1. *Default* - This option is automatic. The app constantly scans a small network range for open servers. This tends to work for small networks (such as home networks) but will miss the majority of servers on larger networks (such as school networks).

    2. *Deep scan* - This method can either be set to run automatically at certain intervals, or you can choose to activate it yourself (see configuration options below). The app will scan every possible address on the network for open servers. This method varies greatly on the network; on smaller networks, it is faster and less resource intensive while on larger networks, it can be slower the bigger the network, and more resource heavy. However, it is the most effective way to search for servers.

        **Configuration options (in settings):**
        * Toggle auto deep scanning - If turned on, the app will run a deep scan every interval specified. If turned off, the `Deep Scan` button (below message box) becomes available, and deep scan will only run if the button is pressed
        * Auto deep scan interval - The number of seconds between each deep scan, if auto deep scanning is enabled
* ##### Recent connections
    This option should be used if you are **reconnecting to a server** you have joined this session.

    The most recent 5 servers which you have connected to will be shown in the "Recent Connections" section. Details of each server will be shown, along with a `Join` button. There is also a "Offline" or "Online" indicator - you will only be able to connect to the server if it is "Online".
* ##### Manually connect to an IP address
    This option should be used if you **do know the IP address** of the server you are connecting to.

    Press the `Direct Connect` button located underneath the message box, and enter the IP address of the server you want to join. Press `Connect`, and if there is an open server on the network with the IP address you entered, you should connect to it.


### Additional Information
* **System Tray** - The app will be hidden to your tray (the list of app icons on the right side of your taskbar) when you close it (pressing the `X`), and you can show it again by pressing the app's icon in the tray. To quit the app, right click it in the tray and press `Quit`. Additionally, the app's icon will change colour when it receives a notification such as a new message or server found when scanning the network.

* **IP Address** - The IP address used in this application is a **Local IP** - it is only used inside the network. 

* **Auto Updating** - The app will check for new updates on startup, or you can press the `Check for Updates` button on the top of the app to check for new updates. If an update is found, press the `Download update` to download it, and then the `Install Update` to install it. NOTE: Installing requires a restart of the app.

* **Encryption** - All messages sent using the app is encrypted (meaning that it is a jumble of random characters when being sent over the network). This should provide sufficient security to prevent others on the network that are not using the app from seeing those messages.

* **DevTools** - Right click on the tray menu to show the context menu. Press `Open DevTools` to open the developer tools for the app, where you can see any errors which may have occurred.
