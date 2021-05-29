//#region setup
const http = require('http');
const WebSocket = require('ws');

const { networkInterfaces } = require('os'); //used to get IP
const { ipcRenderer} = require('electron');

const Store = require('electron-store');
const defaults = {
    recentlyConnected: [],
    username: false,
    fontSize: 1,
    autoStart: false,
    endWhenFound: true,
    joinWhenFound: false,
    flashFrame: true,
    toastNotif: 'all',
    serverName: false
}
const store = new Store({defaults});

const g = document.getElementById.bind(document);
const hostBtn = g('hostBtn'),
    chatBox = g('chatBox'),
    errorDisplay = g('errorDisplay'),
    searchServersBtn = g('searchServersBtn'),
    searchStatus = g('searchStatus'),
    disconnectBtn = g('disconnectBtn'),
    username = g('username'),
    infoServerName = g('infoServerName'),
    infoServerAddress = g('infoServerAddress'),
    searchProgress = g('searchProgress'),
    searchBox = g('searchBox'),
    cancelSearchBtn = g('cancelSearchBtn'),
    endWhenFound = g('endWhenFound'),
    manualConnect = g('manualConnect'),
    manualConnectBtn = g('manualConnectBtn'),
    manualHost = g('manualHost'),
    messageInput = g('messageInput'),
    memberList = g('memberList'),
    memberListDiv = g('memberListDiv'),
    joinWhenFound = g('joinWhenFound'),
    wifi = g('wifi'),
    recentConnections = g('recentConnections'),
    recentConnectionsDiv = g('recentConnectionsDiv'),
    sendMessageBtn = g('sendMessageBtn'),
    pingConnectionsBtn = g('pingConnectionsBtn'),
    settingsIcon = g('settingsIcon'),
    settingsContainer = g('settingsContainer'),
    fontSizeSlider = g('fontSizeSlider'),
    fontSizeDisplay = g('fontSizeDisplay'),
    autoStart = g('autoStart'),
    flashFrame = g('flashFrame'),
    toastNotif = g('toastNotif'),
    hostConfigContainer = g('hostConfigContainer'),
    hostServerName = g('hostServerName'),
    hostServerBtn = g('hostServerBtn')

displayAppVersion();
setupAutoupdating();

let host, wss, server, clientWs;
let halt = false;
let searching = false;
const port = 121;
let recentlyConnected = store.get('recentlyConnected') || [];
const status = {
    isTypingValue: false,
    set isTyping(value){

        if (this.isTypingValue !== value) {
            this.isTypingValue = value;
            messageInput.dispatchEvent(new Event('typing'));
        };
    },
    get isTyping(){
        return this.isTypingValue;
    },

    statusValue: true,
    set status(value) {

        if (this.statusValue !== value) {
            this.statusValue = value;
            document.dispatchEvent(new Event('status'));
        };
    },
    get status(){
        return this.statusValue;
    }
};

document.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    switch (document.activeElement){
        case document.body:
            messageInput.focus();
            break;
        case username:
            username.blur();
            break;
        case manualHost:
            manualConnectBtn.click();
            break;
    };
});

hostBtn.addEventListener('click', hostConfig);
searchServersBtn.addEventListener('click', runSearches);
cancelSearchBtn.addEventListener('click', endSearch);
manualConnectBtn.addEventListener('click', () => {
    if (!manualHost.value){
        configError('Please enter a host');
        return;
    };
    connectToServer(false, manualHost.value);
});

function generateid(length) {
    let result = '';
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for ( let i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * characters.length));
    };
    return result;
};

joinWhenFound.addEventListener('input', () => { //when join when found option is checked, turns end when found on and disables it
    if (joinWhenFound.checked) {
        endWhenFound.checked = true;
        endWhenFound.disabled = true;
    } else {
        endWhenFound.disabled = false;
    };
});

updateConnection();
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
function updateConnection(){
    if (navigator.onLine){
        wifi.src = '../imgs/wifiConnected.png';
    } else {
        wifi.src = '../imgs/wifiDisconnected.png';
    };
};

setupRecentlyConnected();
//#endregion

function hostConfig(){
    hostConfigContainer.style.display = 'flex';
    hostConfigContainer.onclick = event => {
        if (event.target === hostConfigContainer) hostConfigContainer.style.display = 'none';
    };
    hostServerName.value = store.get('serverName') || `${username.value}'s Server`;

    hostServerBtn.onclick = () => {
        if (hostServerName.value.length < 1) {
            alert('Please enter a server name');
            return;
        };
        hostConfigContainer.style.display = 'none';
        hostServer(hostServerName.value)
    };
};

function hostServer(serverName){
    if (!username.value) {
        configError('Please enter a username');
        return;
    } else if (!navigator.onLine){
        configError('Not connected to a network');
        return;
    };

    store.set('serverName', serverName);
    host = getIp();

    let history = [];
    let wsId = 1; //used to identify individual websockets

    server = http.createServer((req, res) => {//ends with host name and server name so network scanning can show this data
        res.end(JSON.stringify({serverName, hostName: username.value}));
    }); 
    server.on('error', error => {
        server.close(); 
        parseMessage(newMessage('system error', 'Local System', `There was an error hosting the server: ${error}`));
    });
    server.listen(port, host, setupWs);

    function setupWs(){ //sets up the websocket server 
        chatBox.innerHTML = '';
        parseMessage(newMessage('system', 'Local System', `Server hosted at http://${host}:${port}`));
        wss = new WebSocket.Server({
            server: server,
            clientTracking: true
        });
        let banList = [];
        wss.on('connection', (ws, request) => {

            if (banList.includes(request.socket.remoteAddress)) {
                ws.send(newMessage('system error', 'Server', 'You have been banned from this server'));
                ws.close();
                return;
            };

            heartbeat(ws);

            if (history.length > 0) {
                ws.send(newMessage('history', null, history)); //send chat history to connected websocket
            };
            ws.id = wsId++;
            ws.status = {
                isTyping: false,
                status: true
            };

            ws.send(newMessage('data', null, JSON.stringify({id: ws.id, serverName}))); //assigns an id to the websocket

            ws.on('message', message => { //handle incoming message from websocket
                message = JSON.parse(message);
                switch(message.type) {

                    case 'data': //save username and if host of the websocket
                        const data = JSON.parse(message.data);

                        //check if duplicate username
                        wss.clients.forEach(client => {if (client.username === data.username) data.username += ` [${ws.id}]`;});

                        ws.username = data.username;
                        ws.isHost = data.isHost;

                        const msg = newMessage('system join', 'Global System', `${ws.username}${ws.isHost ? ' (host)' : ''} has joined`);
                        sendToAll(msg, true);

                        sendMemberList(); //updates the connected members list
                        break;

                    case 'kick':
                        wss.clients.forEach(socket => {
                            if (socket.id === message.data) {
                                sendToAll(newMessage('system error', 'Global System', `${socket.username} has been kicked`), true);
                                socket.close(1000, 'kick');
                            };
                        });
                        break;

                    case 'ban':
                        wss.clients.forEach(socket => {
                            if (socket.id === message.data && confirm(`Ban ${socket.username} from this server permanently?`)) {
                                sendToAll(newMessage('system error', 'Global System', `${socket.username} has been banned`), true);
                                socket.close(1000, 'ban');
                                banList.push(socket._socket.remoteAddress);
                            };
                        });
                        break;

                    default:
                        typeof message.username === 'number' ? null : message.username = ws.username;
                        sendToAll(JSON.stringify(message), false);

                        switch(message.type) {
                            case 'typing':
                                ws.status.isTyping = message.data;
                                break;
                            case 'status':
                                ws.status.status = message.data;
                                break;
                            default:
                                history.push(JSON.stringify(message));
                        };
                };
                history = history.slice(-100); //trims chat history to the latest 100
            });

            ws.on('close', (code, reason) => {
                if (reason === 'leave') {
                    const msg = newMessage('system leave', 'Global System', `${ws.username} has left`);
                    sendToAll(msg, true);
                } else if (reason === 'heartbeat') {
                    const msg = newMessage('system leave', 'Global System', `${ws.username} failed to connect`);
                    sendToAll(msg, true);
                } else if (code !== 1000){
                    const msg = newMessage('system leave', 'Global System', `${ws.username} disconnected`);
                    sendToAll(msg, true);
                };
                sendMemberList();

                if (wss.clients.size === 0) {disconnectAll();};
            });

            function sendToAll(message, saveToHistory){
                wss.clients.forEach(ws => ws.send(message));
                if (saveToHistory) history.push(message);
            };
            function sendMemberList(){
                let members = [];
                wss.clients.forEach(ws => {
                    members.push({username: ws.username, isHost: ws.isHost, id: ws.id, status: ws.status})
                });
                sendToAll(newMessage('memberList', null, members));
            };
        });
        connectToServer(true);
    };
};

function connectToServer(isHoster, ip){
    let serverName;

    if (searching) endSearch(true);
    searchBox.style.display = 'none';
    searchBox.innerHTML = '';
    parseMessage(newMessage('system', 'Local System', `Connecting to ${ip}...`));

    if (!isHoster){
        if (!username.value) {
            configError('Please enter a username');
            return;
        }  else if (!navigator.onLine){
            configError('Not connected to a network');
            return;
        };
        if (wss) wss.close();
        host = ip;
    };

    username.setAttribute('readonly', true);
    infoServerAddress.innerText = host;

    clientWs = new WebSocket(`http://${host}:${port}`);

    if (!document.body.getAttribute('listeners')) {
        document.body.setAttribute('listeners', 'true')
        messageInput.addEventListener('typing', () => {
            if (clientWs.readyState !== 1) return;

            clientWs.send(newMessage('typing', clientWs.id, status.isTyping));
        });
        document.addEventListener('status', () => {
            if (clientWs.readyState !== 1) return;

            clientWs.send(newMessage('status', clientWs.id, status.status));
        });
    };

    let timeout = setTimeout(disconnectAll, 10000); //disconnects websocket if it fails to connect within 10 seconds

    clientWs.on('error', error => {
        parseMessage(newMessage('system error', 'Local System', `There was an error connecting to the server: ${error}`));
    });

    clientWs.on('open', () => {
        chatBox.innerHTML = '';

        clearTimeout(timeout);
        parseMessage(newMessage('system', 'Local System', `Connected to http://${host}:${port}`));

        clientWs.send(newMessage('data', null, JSON.stringify({username: username.value, isHost: isHoster ? true : false}))); //send username and if host to websocket server
    });

    clientWs.on('message', message => { //handle incoming message from websocket server
        message = JSON.parse(message);

        switch (message.type) {
            case 'history': //if receiving chat history
                message.data.forEach(data => parseMessage(data));
                break;

            case 'memberList':
                memberList.innerHTML = '';

                message.data.forEach(member => {
                    const usernameSpan = document.createElement('span');
                    usernameSpan.setAttribute('class', `connectionName ${member.id === clientWs.id ? 'you' : ''}`);
                    usernameSpan.textContent = member.username;

                    const statusDiv = document.createElement('div');
                    statusDiv.setAttribute('class', `userStatus ${member.status.status ? '' : 'idle'}`);

                    const typingIndicator = document.createElement('span');
                    typingIndicator.setAttribute('class', 'typingIndicator');
                    typingIndicator.innerText = ' typing...';
                    typingIndicator.style.display = member.status.isTyping ? 'inline' : 'none';

                    const mainDiv = document.createElement('div');
                    mainDiv.setAttribute('id', member.id);
                    mainDiv.append(statusDiv, usernameSpan);

                    if (member.isHost) {
                        const hostSpan = document.createElement('span');
                        hostSpan.setAttribute('class','host');
                        hostSpan.innerText = 'HOST';

                        mainDiv.appendChild(hostSpan)
                    };

                    if (isHoster && !member.isHost) {
                        const kickBtn = document.createElement('button');
                        kickBtn.innerText = 'KICK';
                        kickBtn.setAttribute('class', 'kickBanBtn kickBtn');
                        kickBtn.onclick = () => clientWs.send(newMessage('kick', null, member.id));

                        const banBtn = document.createElement('button');
                        banBtn.innerText = 'BAN';
                        banBtn.setAttribute('class', 'kickBanBtn banBtn');
                        banBtn.onclick = () => clientWs.send(newMessage('ban', null, member.id));

                        mainDiv.append(banBtn, kickBtn);
                    };

                    mainDiv.append(typingIndicator);

                    memberList.appendChild(mainDiv);

                    if (member.isHost && member.id !== clientWs.id){ //adds the server to recently connected using the host's name and ip
                        recentlyConnected.unshift({serverName, hostName: member.username, ipAddress: host});

                        setupRecentlyConnected();
                    };
                });
                break;

            case 'data': //sets the websocket to the id assigned by the server and receives server name
                const data = JSON.parse(message.data)
                clientWs.id = data.id;
                serverName = data.serverName
                infoServerName.innerText = serverName;
                break;

            case 'typing': //displays info in member list like if they're typing

                for (let element of document.getElementsByClassName('typingIndicator')){
                    if (parseInt(element.parentElement.id) === message.username) {
                        element.style.display = message.data ? 'inline' : 'none';
                        break;
                    };
                };
                break;

            case 'status':

                for (let element of document.getElementsByClassName('userStatus')){
                    if (parseInt(element.parentElement.id) === message.username) {
                        element.setAttribute('class', `userStatus ${message.data ? '' : 'idle'}`)
                        break;
                    };
                };
                break;

            default: 
                parseMessage(JSON.stringify(message));
        };
    });

    clientWs.on('close', () => {
        parseMessage(newMessage('system leave', 'Local System', 'Connection closed'));
        toggleConnectionBtns(true);
    });

    document.onkeydown = sendMessage;
    sendMessageBtn.onclick = sendMessage;

    const messageSendEvent = new Event('messageSent');
    function sendMessage(event) { //send message to websocket server
        if (event.type === 'keydown' && (event.key !== 'Enter' || document.activeElement !== messageInput)) return;
        
        if (clientWs.readyState === 1 && messageInput.value.trim().length > 0){
            clientWs.send(newMessage('message', null, messageInput.value.trim()));
            messageInput.value = '';
            messageInput.dispatchEvent(messageSendEvent);
        };
    };

    toggleConnectionBtns(false);
    disconnectBtn.onclick = disconnectAll;
};

function heartbeat(websocket){ //setup 'heartbeat' to make sure both sockets are connected
    let pingCounter = 0;

    const pingPong = () => {
        if (websocket.readyState !== 1) return;
        websocket.ping();
        if (++pingCounter === 5) {
            websocket.close(1000, 'heartbeat');
        } else {
            setTimeout(pingPong, 3000);
        };
    };
    setTimeout(pingPong, 3000);

    websocket.on('pong', () => pingCounter--);
};

function setupRecentlyConnected(){
    recentlyConnected = recentlyConnected.filter((server, index, array) => index === array.findIndex(s => s.ipAddress === server.ipAddress));
    recentlyConnected = recentlyConnected.slice(0,6);

    recentConnections.innerHTML = '';

    recentlyConnected.forEach((server, index) => {
        const ipBtn = document.createElement('button');
        ipBtn.style.fontWeight = 'bold';
        ipBtn.textContent = `${server.serverName} | ${server.hostName} | ${server.ipAddress}`;

        recentConnections.appendChild(ipBtn);
        ipBtn.onclick = () => connectToServer(false, server.ipAddress);

        recentlyConnected[index].btn = ipBtn;
    });
    store.set('recentlyConnected', recentlyConnected);
    pingRecentlyConnected();
};

function disconnectAll(){
    if (wss) {
        wss.close();
        server.close();
    };
    clientWs.close(1000, 'leave');
};

function runSearches(){
    if (!navigator.onLine){
        configError('Not connected to a network');
        return;
    };

    halt = false;
    searching = true;
    toggleSearchBtns(false);

    searchBox.style.display = 'block';
    searchBox.innerHTML = '';

    let ip = getIp().split('.');
    ip.splice(-2, 2);
    ip = ip.join('.'); //get the first two octets of the ip (xxx.xxx.123.123 - gets the x's)

    searchProgress.value = 0;
    search(1, 25);

    function search(min, max){
        if (halt) return;

        setSearchStatus(`Scanning ${ip}.${min}.0 to ${ip}.${max}.255`);
        searchServers(min, max) //search a range of 25 for the third octet, along with 0 - 255 for the last octet (normally third octet would be the same for all devices but some big networks have different third octets)
        .then(array => {
            if (min < 251) { //if search has not reached 255 yet than continue searching the next 25
                if (!halt) searchProgress.value += 0.1;
                search(min + 25, max + 25);
            } else {
                if (toastNotif.value !== 'msg') sendNotif(`Finished Scan - ${searchBox.children.length} server${searchBox.children.length === 1 ? '' : 's'} found`);
                setSearchStatus('Finished Scan');
                toggleSearchBtns(true);
                searching = false;

                setTimeout(() => {
                    document.onclick = () => {
                        setSearchStatus('');
                        document.onclick = null;
                    };
                }, 100);
            };

            if (array.length < 1) return;

            array.forEach(ip => { //for each server found in the same range of 25 
                const ipBtn = document.createElement('button');
                searchBox.appendChild(ipBtn);
                ipBtn.onclick = () => connectToServer(false, ip); //creates the button that will connect to the server

                const req = http.request({hostname: ip, port: port, method: 'GET'}, res => { //sends a request to the server for the host's username
                    res.on('data', data => {
                        data = JSON.parse(data);
                        ipBtn.innerText = `${data.serverName} | ${data.hostName} | ${ip}`;
                    });
                });
                req.on('error', error => {
                    console.error(error)
                });
                req.end();
            });
    
        })
        .catch(error => {
            console.error(error);
        });
    };

    function searchServers(minI, maxI){
        const net = require('net');
        const Socket = net.Socket;

        let addresses = [];
        let socketNum = 0;
      
        const promise = new Promise((resolve, reject) => {
            for (let i = minI; i <= maxI && !halt; i++){
                for (let j = 1; j <= 255 && !halt; j++){

                    let status = null;
                    const socket = new Socket();

                    ++socketNum;
        
                    socket.on('connect', () => {
                        status = 'open';
                        socket.end();
                    });
                    socket.setTimeout(1500);
                    socket.on('timeout', () => {
                        status = 'closed';
                        socket.destroy();
                    });
                    socket.on('error', () => status = 'closed');
                    socket.on('close', () => {
                        --socketNum;
                        if (status == "open"){
                            addresses.push(`${ip}.${i}.${j}`);

                            if (endWhenFound.checked){
                                endSearch(joinWhenFound.checked ? addresses[0] : false);
                                resolve(addresses);
                                return;
                            };
                        };
                        if (socketNum === 0) {
                            resolve(addresses);
                        };
                    });
                    socket.connect(port, `${ip}.${i}.${j}`);
                };
            };
        });
        return promise;
    };
};

function setSearchStatus(message){searchStatus.innerHTML = message;};

function endSearch(ip){
    halt = true;
    searching = false;
    setSearchStatus('Ended scan');
    toggleSearchBtns(true);
    

    setTimeout(() => {
        document.onclick = () => {
            setSearchStatus('');
            document.onclick = null;
        };
    }, 100);

    if (typeof ip === 'string') connectToServer(false, ip);
    if (!ip && toastNotif.value !== 'msg') sendNotif('Server found');
};

function parseMessage(data){
    data = JSON.parse(data);
    const timeEm = document.createElement('em');
    timeEm.innerText = data.time;

    const usernameStrong = document.createElement('strong');
    usernameStrong.innerText = `${data.username}: `;

    const messageData = document.createElement('span');
    messageData.innerText = data.data;

    const message = document.createElement('div');
    message.setAttribute('class', `${data.type} chatMessage`);
    message.append(timeEm, ' ', usernameStrong, messageData);

    chatBox.appendChild(message);
    scrollDown();
    trimMessages();
    
    if (toastNotif.value !== 'networkScan') sendNotif(`${data.username}: ${data.data}`);
};

function trimMessages(){ //caps the chatbox to 100 messages
    let messages = Array.from(document.getElementsByClassName('chatMessage')).slice(-100);
    chatBox.innerHTML = '';
    messages.forEach(msg => chatBox.appendChild(msg));
};

function newMessage(type, username, data){ //convert this to a constructor maybe someday
    const date = new Date();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const message = {
        type, 
        time: `${hours.toString().length < 2 ? '0' : ''}${hours}:${minutes.toString().length < 2 ? '0' : ''}${minutes}`,
        username,
        data
    };
    return JSON.stringify(message);
};

function configError(error){
    errorDisplay.innerHTML = error;
    setTimeout(() => errorDisplay.innerHTML = '', 3000);
};

function scrollDown(){chatBox.scrollTop = chatBox.scrollHeight - chatBox.clientHeight;};

function getIp(){
    const networks = networkInterfaces().WiFi;
    return networks.filter(network => network.family === "IPv4")[0].address;
};

function toggleSearchBtns(normal){
    searchProgress.style.display = normal ? 'none' : 'block';
    searchServersBtn.style.display = normal ? 'inline' : 'none';
    cancelSearchBtn.style.display = normal ? 'none': 'inline';
    hostBtn.style.display = normal ? 'inline' : 'none';
    manualConnect.style.display = normal ? 'block' : 'none';
    recentConnectionsDiv.style.display = normal ? 'block' : 'none';
};

function toggleConnectionBtns(normal){
    hostBtn.style.display = normal ? 'inline-block' : 'none';
    searchServersBtn.style.display = normal ? 'inline-block' : 'none';
    disconnectBtn.style.display = normal ? 'none' : 'inline-block';
    manualConnect.style.display = normal ? 'block' : 'none';
    recentConnectionsDiv.style.display = normal ? 'block' : 'none';
    memberListDiv.style.display = normal ? 'none' : 'block';
    if (normal) {
        username.removeAttribute('readonly');
        infoServerAddress.innerText = '';
        infoServerName.innerText = '';
        memberList.innerHTML = '';
    };
};

function setupAutoupdating(){
    const autoUpdateStatus = g('autoUpdateStatus'),
        checkUpdateBtn = g('checkUpdateBtn'),
        downloadUpdateBtn = g('downloadUpdateBtn'),
        downloadUpdateProgress = g('downloadUpdateProgress'),
        installUpdateBtn = g('installUpdateBtn');
    
    ipcRenderer.send('autoUpdateCheck', true);
    
    checkUpdateBtn.onclick = () => ipcRenderer.send('autoUpdater', 'checkUpdate');
    downloadUpdateBtn.onclick = () => ipcRenderer.send('autoUpdater', 'downloadUpdate');
    installUpdateBtn.onclick = () => ipcRenderer.send('autoUpdater', 'installUpdate');

    ipcRenderer.on('autoUpdater', (event, { type, text, data }) => {
        autoUpdateStatus.textContent = text;
        autoUpdateStatus.style.color = 'orange';

        autoUpdateStatus.title = type === 'error' ? data : text;
        checkUpdateBtn.style.display = type === 'error' || type === 'updateNone' ? 'inline' : 'none';
        downloadUpdateBtn.style.display = type === 'updateAvailable' ? 'inline' :'none';
        downloadUpdateProgress.style.display = type === 'updateDownloading' ? 'inline' : 'none';
        installUpdateBtn.style.display = type === 'updateDownloaded' ? 'inline' : 'none';

        downloadUpdateProgress.value = type === 'updateDownloading' ? data.percent / 100 : 0;

        document.onmousedown = () => { if (['error', 'updateNone'].includes(type)) autoUpdateStatus.style.color = 'black'; };
    });
};

function displayAppVersion(){
    const appVersion = g('appVersion');
    appVersion.innerText = `v${require("electron").remote.app.getVersion()}`;
};

function pingRecentlyConnected(){
    recentlyConnected.forEach(server => {
        const btn = server.btn;
        btn.style.color = 'red';
        btn.title = 'Pinging...';
        const req = http.request({hostname: server.ipAddress, port: port, method: 'GET'}, res => {
            btn.style.color = 'green';
            btn.title = 'Server Online';
            res.on('data', data => {
                data = JSON.parse(data);
                btn.innerText = `${data.serverName} | ${data.hostName} | ${server.ipAddress}`;
            });
        });
        req.on('error', error => {
            btn.title = 'Server Offline';
        });
        req.end();
    });
};
pingConnectionsBtn.onclick = pingRecentlyConnected;

settingsIcon.onclick = () => settingsContainer.style.display = 'flex';
settingsContainer.onclick = event => {
    if (event.target === settingsContainer) settingsContainer.style.display = 'none';
};

!function setupSettings(){
    let settings = store.store;

    applySettings();
    function applySettings(){
        settings = store.store;

        username.value = settings.username || `Guest_${generateid(5)}`;
        fontSizeSlider.value = settings.fontSize;
        chatBox.style.fontSize = `${0.7 * fontSizeSlider.value}em`;
        fontSizeDisplay.innerText = `${settings.fontSize * 100}%`;
        endWhenFound.checked = settings.endWhenFound;
        joinWhenFound.checked = settings.joinWhenFound;
        endWhenFound.disabled = joinWhenFound.checked ? true : false;
        autoStart.checked = settings.autoStart;
        flashFrame.checked = settings.flashFrame;
        ipcRenderer.send('flashFrame', flashFrame.checked);
        toastNotif.value = settings.toastNotif;
    };

    //save settings
    const saveSettingsBtn = g('saveSettingsBtn'),
        resetSettingsBtn = g('resetSettingsBtn');

    saveSettingsBtn.onclick = () => {
        store.set({
            username: username.value || false,
            fontSize: fontSizeSlider.value,
            autoStart: autoStart.checked,
            endWhenFound: endWhenFound.checked,
            joinWhenFound: joinWhenFound.checked,
            flashFrame: flashFrame.checked,
            toastNotif: toastNotif.value
        });
        ipcRenderer.send('autoStart', autoStart.checked);
    };
    resetSettingsBtn.onclick = () => {
        if (confirm('Reset ALL settings to default?')) {
            store.reset(...Object.keys(defaults).filter(key => key !== 'recentlyConnected'));
            applySettings();
        };
    };

    //font size
    fontSizeSlider.oninput = () => {
        fontSizeDisplay.innerText = `${fontSizeSlider.value * 100}%`;
        chatBox.style.fontSize = `${0.7 * fontSizeSlider.value}em`;
    };

    //flash frame
    flashFrame.oninput = () => ipcRenderer.send('flashFrame', flashFrame.checked);
}();

let notif;
function sendNotif(body) {
    if (!document.hasFocus() && toastNotif.value !== 'none'){
        ipcRenderer.send('ping', null);

        if (notif) notif.close(); //close the previous notification
        notif = new Notification('Local Messaging', { icon: '../imgs/tray.png', body, silent: true });

        window.onfocus = () => notif.close();
    };
};

!function checkIfTyping(){
    let id;

    messageInput.addEventListener('input', () => { //listen for input on the messageInput element
        if (messageInput.value.length === 0) {
            clearTimeout(id);
            id = setTimeout(() => status.isTyping = false, 1000);
        } else {
            clearTimeout(id);
            status.isTyping = true

            id = setTimeout(() => status.isTyping = false, 3000);
        };
    });
    messageInput.addEventListener('messageSent', () => { //listen for when message is sent and reduce time to 1 second 
        clearTimeout(id);
        id = setTimeout(() => status.isTyping = false, 1000);
    });
}();

window.addEventListener('focus', () => status.status = true);
window.addEventListener('blur', () => status.status = false);