const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const bonjour = require('bonjour')();

Store.initRenderer();
Menu.setApplicationMenu(null);

let tray;

function boot(){
    const icon = nativeImage.createFromPath(path.join(app.getAppPath(),'./imgs/tray.png'));
    const win = new BrowserWindow({
        width: 400,
        height: 610,
        show: false,
        title: 'Local Messaging',
        icon: icon,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true
        }
    });
    win.loadFile('./renderer/index.html');
    win.webContents.on('did-finish-load', () => win.show());
    ipcMain.on('autoUpdateCheck', setupAutoupdate);

    setupNotifs();

    function setupNotifs(){
        let doFlashFrame = true;
        ipcMain.on('flashFrame', (event, flashFrame) => doFlashFrame = flashFrame);

        win.on('close', event => {
            if (!app.isQuitting){
                event.preventDefault();
                win.hide();
            };
        });

        const contextMenu = Menu.buildFromTemplate([
            { 
                label: 'Quit', 
                click:  function(){
                    app.isQuitting = true;
                    app.quit();
                } 
            },
            {
                label: 'Show DevTools',
                click: () => { win.webContents.openDevTools(); }
            }
        ]);
        let pinging = false;

        tray = new Tray(icon);
        tray.setToolTip('Right click for options');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => win.show());

        const pingImage = nativeImage.createFromPath(path.join(app.getAppPath(), './imgs/notif.png'));

        ipcMain.on('ping', () => {
            if (!pinging){
                if (doFlashFrame) win.flashFrame(true);
                tray.setImage(pingImage);
                
                pinging = true;
            };
        });
        win.on('focus', () => {
            if (pinging){
                if (doFlashFrame) win.flashFrame(false);
                tray.setImage(icon);
                pinging = false;
            };
        });
    };
    function setupAutoupdate(){
        autoUpdater.autoDownload = false;
        autoUpdater.checkForUpdates().catch(error => sendUpdate('error', 'An error occurred while checking for updates (hover for error) - this may happen if github.com is blocked on your network', error));

        autoUpdater.on('checking-for-update', () => sendUpdate('updateCheck', 'Checking for updates...'));
        autoUpdater.on('update-available', info => sendUpdate('updateAvailable', 'Update available', info));
        autoUpdater.on('update-not-available', () => sendUpdate('updateNone', 'No new updates'));
        autoUpdater.on('download-progress', progressObj => sendUpdate('updateDownloading', 'Downloading...', progressObj));
        autoUpdater.on('update-downloaded', info => sendUpdate('updateDownloaded', 'Update Downloaded', info));
        
        ipcMain.on('autoUpdater', (event, action) => {
            switch (action) {
                case 'checkUpdate':
                    autoUpdater.checkForUpdates().catch(error => sendUpdate('error', 'An error occurred while checking for updates (hover for error) - this may happen if github.com is blocked on your network', error));
                    break;
                case 'downloadUpdate':
                    autoUpdater.downloadUpdate().catch(error => sendUpdate('error', 'An error occurred while downloading update (hover for error)', error));
                    break;
                case 'installUpdate':
                    autoUpdater.quitAndInstall();
                    break;
            };
        });

        function sendUpdate(type, text, data){
            win.webContents.send('autoUpdater', { type, text, data });
        };
    };

    let hostService, browser;
    ipcMain.on('bonjour', (event, args) => {
        switch (args.type){
            case 'service':
                hostService = bonjour.publish({ name: JSON.stringify({ serverName: args.serverName, hostName: args.hostName }), type: 'http', port: args.port});
                break;
            case 'closeService':
                bonjour.unpublishAll();
                break;
            case 'getServices':
                event.returnValue = browser?.services;
                break;
            case 'find':
                browser = bonjour.find({ type: 'http' });
                browser.on('up', service => {
                    if (service.port === 121 && (hostService?.published ? service.host !== hostService.host : true)) win.webContents.send('bonjour', { action: 'up', service });
                });
                browser.on('down', service => {
                    if (service.port === 121) win.webContents.send('bonjour', { action: 'down', service });
                });
                break;
        }
    });
}

app.on('ready', boot);
app.on('before-quit', () => tray.destroy());

ipcMain.on('autoStart', (event, autoStart) => app.setLoginItemSettings({openAtLogin: autoStart}));