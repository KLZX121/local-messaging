const WebSocket = require('ws');

const { ipcRenderer } = require('electron');
const http = require('http');

const Store = require('electron-store');
const defaults = {
    recentlyConnected: [],
    username: false,
    fontSize: 1,
    autoStart: false,
    flashFrame: true,
    toastNotif: {
        serverOnline: true,
        serverFound: true,
        msg: true
    },
    serverName: null,
    deepScan: {
        doAuto: true,
        interval: 30
    }
};
const migrations = {
    '1.2.0': store => {
        store.clear();
    }
}
const store = new Store({defaults, migrations});

const encryption = require('./encryption.js');
const { getIpSubnet, networkSearch } = require('./networkSearch.js');

const g = document.getElementById.bind(document);
const hostConfigBtn = g('hostConfigBtn'),
    chatBox = g('chatBox'),
    errorDisplay = g('errorDisplay'),
    disconnectBtn = g('disconnectBtn'),
    username = g('username'),
    infoServerName = g('infoServerName'),
    infoServerAddress = g('infoServerAddress'),
    serverFoundList = g('serverFoundList'),
    manualConnectDiv = g('manualConnectDiv'),
    manualConnectBtn = g('manualConnectBtn'),
    manualHost = g('manualHost'),
    messageInput = g('messageInput'),
    memberList = g('memberList'),
    memberListDiv = g('memberListDiv'),
    wifi = g('wifi'),
    recentConnections = g('recentConnections'),
    recentConnectionsDiv = g('recentConnectionsDiv'),
    sendMessageBtn = g('sendMessageBtn'),
    settingsIcon = g('settingsIcon'),
    settingsContainer = g('settingsContainer'),
    fontSizeSlider = g('fontSizeSlider'),
    fontSizeDisplay = g('fontSizeDisplay'),
    autoStart = g('autoStart'),
    flashFrame = g('flashFrame'),
    hostConfigContainer = g('hostConfigContainer'),
    hostServerName = g('hostServerName'),
    hostServerBtn = g('hostServerBtn'),
    controlPanel = g('controlPanel'),
    noServersPlaceholder = g('noServersPlaceholder'),
    notifServerOnline = g('notifServerOnline'),
    notifServerFound = g('notifServerFound'),
    notifMsg = g('notifMsg'),
    directConnectBtn = g('directConnectBtn'),
    manualConnectContainer = g('manualConnectContainer'),
    deepScanBtn = g('deepScanBtn'),
    doAutoDeepScan = g('doAutoDeepScan'),
    autoDeepScanInt = g('autoDeepScanInt'),
    deepScanSpan = g('deepScanSpan');

const port = 121;
let isHosting = false
let isConnected = false;;
let recentlyConnected = store.get('recentlyConnected');
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
        case hostServerName:
            hostServerBtn.click();
            break;
    };
});

deepScanBtn.addEventListener('click', deepScan);

function deepScan(){
    deepScanSpan.style.display = 'inline';
    networkSearch(port, addresses => {
        addresses = addresses.flat();
        addresses.forEach(address => {
            for (const serverElement of serverFoundList.children) {
                if (serverElement.id.replace('foundServer-', '') === address || (isHosting && address === getIpSubnet().ip)){
                    return;
                };
            };
            const req = http.request({hostname: address, port: port, method: 'GET'}, res => { //sends a request to the server for the server data
                res.on('data', data => {
                    data = JSON.parse(data.toString());
                    noServersPlaceholder.style.display = 'none';
                    createServerList({ipAddress: address, serverName: data.serverName, hostName: data.hostName}, serverFoundList, 'foundServer');

                    for (const server of recentConnections.children) {
                        if (server.id.replace('recentServer-', '') === address){
                            const statusElement = server.getElementsByClassName('serverStatus')[0];
                            statusElement.classList.remove('offline');
                            statusElement.classList.add('online');
                            statusElement.innerText = 'Online';
        
                            const serverName = server.getElementsByClassName('serverName')[0];
                            serverName.innerText = data.serverName;
        
                            const serverUsername = server.getElementsByClassName('serverUsername')[0];
                            serverUsername.innerText = data.hostName;
                            if (notifServerOnline.checked) sendNotif(`Recently connected server online: ${data.serverName}`);
                            return;
                        };
                    };
                    if (notifServerFound.checked) sendNotif(`Server open on network: ${data.serverName}`);
                });
            });
            req.on('error', error => {
                parseMessage(newMessage('system error', 'Local System', error));
            });
            req.end();
        })
        const offlineServers = Array.from(serverFoundList.children).filter(serverElement => !addresses.includes(serverElement.id.replace('foundServer-', '')));
        offlineServers.forEach(serverDiv => {
            if (serverDiv === noServersPlaceholder) return;
            for (const server of recentConnections.children) {
                if (server.id.replace('recentServer-', '') === serverDiv.id.replace('foundServer-', '')){
                    const statusElement = server.getElementsByClassName('serverStatus')[0];
                    statusElement.classList.remove('online');
                    statusElement.classList.add('offline');
                    statusElement.innerText = 'Offline';
                };
            };
            serverDiv?.remove();

            if (serverFoundList.children.length === 1) noServersPlaceholder.style.display = 'block';
        });
        deepScanSpan.style.display = 'none';
    });
}

directConnectBtn.addEventListener('click', manuallyConnectConfig);

function manuallyConnectConfig(){
    manualConnectContainer.style.display = 'flex';
    manualHost.focus();

    manualConnectContainer.onclick = event => {
        if (event.target === manualConnectContainer) manualConnectContainer.style.display = 'none';
    };

    manualConnectBtn.onclick = () => {
        if (!manualHost.value){
            configError('Please enter a host');
            return;
        };
        connectToServer(manualHost.value, false);
        manualConnectContainer.style.display = 'none';
    };
}

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

hostConfigBtn.addEventListener('click', hostConfig);
function hostConfig(){
    hostConfigContainer.style.display = 'flex';
    hostServerName.focus();

    hostConfigContainer.onclick = event => {
        if (event.target === hostConfigContainer) hostConfigContainer.style.display = 'none';
    };
    if (store.get('serverName')) {
        hostServerName.value = store.get('serverName');
        hostServerName.setAttribute('defaultName', 'false');
    } else {
        hostServerName.value = `${username.value}'s Server`;
        hostServerName.setAttribute('defaultName', 'true');
    };
      
    hostServerBtn.onclick = () => {
        if (hostServerName.value.length < 1) {
            hostServerName.value = `${username.value}'s Server`;
            hostServerName.setAttribute('defaultName', 'true');
        } else if (hostServerName.value !== `${username.value}'s Server`.trim()) {
            hostServerName.setAttribute('defaultName', 'false');
        };
        hostConfigContainer.style.display = 'none';
        hostServer(hostServerName.value)
    };

    function hostServer(serverName){
        if (!username.value) {
            configError('Please enter a username');
            return;
        } else if (!navigator.onLine){
            configError('Not connected to a network');
            return;
        };
    
        if (hostServerName.getAttribute('defaultName') === 'false') store.set('serverName', serverName);
    
        let history = [];
        let wsId = 1; //used to identify individual websockets
    
        const httpServer = http.createServer((req, res) => res.end(JSON.stringify({serverName , hostName: username.value})));
        httpServer.on('error', error => {
            httpServer.close(); 
            parseMessage(newMessage('system error', 'Local System', `There was an error hosting the server: ${error}`));
        })
        httpServer.listen(port, getIpSubnet().ip, setupWs);

        function setupWs(){ //sets up the websocket server 
            chatBox.innerHTML = '';
            const wss = new WebSocket.Server({
                server: httpServer,
                clientTracking: true
            });
            let banList = [];

            ipcRenderer.send('bonjour', {type: 'service', serverName, hostName: username.value, port});

            isHosting = true;
            parseMessage(newMessage('system', 'Local System', `Server hosted at http://${wss.address().address}:${port}`));
            connectToServer(wss.address().address, true, wss);

            wss.on('error', error => {
                parseMessage(newMessage('system error', 'Local System', `There was an error hosting the server: ${error}`));
            });
            wss.on('close', (e) => {
                isHosting = false;
                ipcRenderer.send('bonjour', {type: 'closeService'});
                httpServer.close();
            });
            wss.on('connection', (ws, request) => {
    
                if (banList.includes(request.socket.remoteAddress)) {
                    ws.send(newMessage('system error', 'Server', 'You have been banned from this server'));
                    ws.close();
                    return;
                };
    
                 //setup 'heartbeat' to make sure both sockets are connected
                 //probably doesnt work well so need to fix it up once more testing is done
                let pingCounter = 0;
                const pingPong = () => {
                    if (ws.readyState !== 1) return;
                    ws.ping();
                    if (++pingCounter === 5) {
                        ws.close(1000, 'heartbeat');
                    } else {
                        setTimeout(pingPong, 3000);
                    };
                };
                setTimeout(pingPong, 3000);
                ws.on('pong', () => pingCounter--);
    
                ws.id = wsId++;
                ws.status = {
                    isTyping: false,
                    status: true
                };
                ws.encKey = encryption.createKey();
    
                ws.send(newMessage('data', null, JSON.stringify({id: ws.id, serverName, encKey: ws.encKey}))); //assigns an id to the websocket
                
                if (history.length > 0) {
                    ws.send(encryption.encrypt(ws.encKey, newMessage('history', null, history))); //send chat history to connected websocket
                };
    
                ws.on('message', message => { //handle incoming message from websocket
                    if (ws.username) message = encryption.decrypt(ws.encKey, message);
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
    
                    if (wss.clients.size === 0 && !ws.isHost) {
                        wss.close();
                    };
                });
    
                function sendToAll(message, saveToHistory){
                    wss.clients.forEach(ws => ws.send(encryption.encrypt(ws.encKey, message)));
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
        };
    };
};

function connectToServer(ip, isHoster, websocketServer){
    let serverName;

    parseMessage(newMessage('system', 'Local System', `Connecting to ${ip}...`));

    if (!isHoster){
        if (!username.value) {
            configError('Please enter a username');
            parseMessage(newMessage('system error', 'Local System', `Please enter a username`));
            return;
        }  else if (!navigator.onLine){
            configError('Not connected to a network');
            parseMessage(newMessage('system error', 'Local System', `Not connected to a network`));
            return;
        };
    };

    for (const serverElement of serverFoundList.children) {
        if (serverElement.id.replace('foundServer-', '') === ip){
            serverElement.style.display = 'none';
        };
    };

    username.setAttribute('readonly', true);
    infoServerAddress.innerText = ip;

    const clientWs = new WebSocket(`http://${ip}:${port}`);

    messageInput.addEventListener('typing', sendTyping);
    document.addEventListener('status', sendStatus);

    function sendTyping(){
        if (clientWs.readyState !== 1) return;

        clientWs.send(encryption.encrypt(clientWs.encKey, newMessage('typing', clientWs.id, status.isTyping)));
    };
    function sendStatus(){
        if (clientWs.readyState !== 1) return;

        clientWs.send(encryption.encrypt(clientWs.encKey, newMessage('status', clientWs.id, status.status)));
    };

    let timeout = setTimeout(() => {
        clientWs.close();
    }, 10000); //disconnects websocket if it fails to connect within 10 seconds

    clientWs.on('error', error => {
        parseMessage(newMessage('system error', 'Local System', `There was an error connecting to the server: ${error}`));
    });

    clientWs.on('open', () => {
        if (serverFoundList.children.length === 2) noServersPlaceholder.style.display = 'block';
        isConnected = true;
        chatBox.innerHTML = '';

        clearTimeout(timeout);
        parseMessage(newMessage('system', 'Local System', `Connected to http://${ip}:${port}`));

        clientWs.send(newMessage('data', null, JSON.stringify({username: username.value, isHost: isHoster ? true : false}))); //send username and if host to websocket server
    });

    clientWs.on('message', message => { //handle incoming message from websocket server
        if (clientWs.encKey) message = encryption.decrypt(clientWs.encKey, message);
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
                        kickBtn.onclick = () => clientWs.send(encryption.encrypt(clientWs.encKey, newMessage('kick', null, member.id)));

                        const banBtn = document.createElement('button');
                        banBtn.innerText = 'BAN';
                        banBtn.setAttribute('class', 'kickBanBtn banBtn');
                        banBtn.onclick = () => clientWs.send(encryption.encrypt(clientWs.encKey, newMessage('ban', null, member.id)));

                        mainDiv.append(banBtn, kickBtn);
                    };

                    mainDiv.append(typingIndicator);

                    memberList.appendChild(mainDiv);

                    if (member.isHost && member.id !== clientWs.id){ //adds the server to recently connected using the host's name and ip
                        recentlyConnected.unshift({serverName, hostName: member.username, ipAddress: ip, time: new Date()});
                        setupRecentlyConnected();
                    };
                });
                break;

            case 'data': //sets the websocket to the id assigned by the server and receives server name
                const data = JSON.parse(message.data)
                clientWs.id = data.id;
                serverName = data.serverName
                infoServerName.innerText = serverName;

                clientWs.encKey = data.encKey;
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
        isConnected = false;
        parseMessage(newMessage('system leave', 'Local System', 'Connection closed'));
        toggleConnectionBtns(true);
        for (const serverElement of serverFoundList.children) {
            if (serverElement.id.replace('foundServer-', '') === ip){
                serverElement.removeAttribute('style');
            };
        };
        messageInput.removeEventListener('typing', sendTyping);
        document.removeEventListener('status', sendStatus);
        if (serverFoundList.children.length === 1) {
            noServersPlaceholder.style.display = 'block';
         } else {
            noServersPlaceholder.style.display = 'none';
         }
    });

    document.onkeydown = sendMessage;
    sendMessageBtn.onclick = sendMessage;

    const messageSendEvent = new Event('messageSent');
    function sendMessage(event) { //send message to websocket server
        if (event.type === 'keydown' && (event.key !== 'Enter' || document.activeElement !== messageInput)) return;
        
        if (clientWs.readyState === 1 && messageInput.value.trim().length > 0){
            clientWs.send(encryption.encrypt(clientWs.encKey, newMessage('message', null, messageInput.value.trim())));
            messageInput.value = '';
            messageInput.dispatchEvent(messageSendEvent);
        };
    };

    toggleConnectionBtns(false);

    disconnectBtn.onclick = () => {
        clientWs.close(1000, 'leave');
        if (isHoster) {
            websocketServer.close();
        };
    };
};

function setupRecentlyConnected(){
    recentlyConnected = recentlyConnected.filter((server, index, array) => index === array.findIndex(s => s.ipAddress.toLowerCase() === server.ipAddress.toLowerCase()));
    recentlyConnected = recentlyConnected.slice(0,6);

    recentConnections.innerHTML = '';

    if (recentlyConnected.length === 0) recentConnections.innerHTML += '<span class="emptyListPlaceholder">Looks like you have no recent servers - join a few for them to show up here!</span>';

    recentlyConnected.forEach((server, index) => {        
        recentlyConnected[index].div = createServerList(server, recentConnections, 'recentServer');
    });

    store.set('recentlyConnected', recentlyConnected);
};

!function runBonjourSearches(){
    ipcRenderer.send('bonjour', {type: 'find'});
    ipcRenderer.on('bonjour', (event, args) => {
        const ip = args.service.addresses.filter(ip => ip.split('.').length === 4).join();
        if (args.action === 'up') { //displays server in the "open servers" section
            noServersPlaceholder.style.display = 'none';
            const names = JSON.parse(args.service.name);

            createServerList({ipAddress: ip, serverName: names.serverName, hostName: names.hostName}, serverFoundList, 'foundServer');

            //change status of server if in recently connected
            for (const server of recentConnections.children) {
                if (server.id.replace('recentServer-', '') === ip){
                    const statusElement = server.getElementsByClassName('serverStatus')[0];
                    statusElement.classList.remove('offline');
                    statusElement.classList.add('online');
                    statusElement.innerText = 'Online';

                    const serverName = server.getElementsByClassName('serverName')[0];
                    serverName.innerText = names.serverName;

                    const serverUsername = server.getElementsByClassName('serverUsername')[0];
                    serverUsername.innerText = names.hostName;
                    if (notifServerOnline.checked) sendNotif(`Recently connected server online: ${names.serverName}`);
                    return;
                };
            };
            if (notifServerFound.checked) sendNotif(`Server open on network: ${names.serverName}`);
        } else if (args.action === 'down'){
            const serverDiv = document.getElementById(`foundServer-${ip}`);
            serverDiv?.remove();

            //change status of server if in recently connected
            for (const server of recentConnections.children) {
                if (server.id.replace('recentServer-', '') === ip){
                    const statusElement = server.getElementsByClassName('serverStatus')[0];
                    statusElement.classList.remove('online');
                    statusElement.classList.add('offline');
                    statusElement.innerText = 'Offline';
                };
            };
            if (serverFoundList.children.length === 1) noServersPlaceholder.style.display = 'block';
        };
    });
}();

function createServerList(server, parentElement, type) {
    const serverDiv = document.createElement('div');
    serverDiv.id = `${type}-${server.ipAddress}`;
    serverDiv.setAttribute('class', 'serverContainer');

    const serverName = document.createElement('strong');
    serverName.setAttribute('class', 'serverName');
    serverName.innerText = server.serverName;

    let status, timeSpan;
    if (type === 'recentServer'){
        status = document.createElement('strong');
        status.setAttribute('class', 'serverStatus');
        const onlineServices = ipcRenderer.sendSync('bonjour', { type: 'getServices' });
        onlineServices?.forEach(service => {
            const ip = service.addresses.filter(ip => ip.split('.').length === 4).join();
            if (server.ipAddress === ip){
                status.innerText = 'Online';
                status.classList.add('online');
                return;
            };
        });
        if (!status.innerText) {
            status.innerText = 'Offline';
            status.classList.add('offline');
        };

        timeSpan = document.createElement('span');
        timeSpan.setAttribute('class', 'grey');

        const time = new Date(server.time);     
        const hours = time.getHours(), minutes = time.getMinutes();

        timeSpan.innerText = new Date(time).setHours(0, 0, 0, 0) === new Date().setHours(0, 0, 0, 0) ? `${hours.toString().length < 2 ? '0' : ''}${hours}:${minutes.toString().length < 2 ? '0' : ''}${minutes} ` : `${time.toLocaleDateString()} `;
    };

    const joinBtn = document.createElement('button');
    joinBtn.innerText = 'Join';
    joinBtn.setAttribute('class', 'serverJoinBtn');

    const detailsDiv = document.createElement('div');
    detailsDiv.setAttribute('class', 'serverDetailsDiv');

    const usernameStrong = document.createElement('strong');
    usernameStrong.innerText = server.hostName;
    usernameStrong.setAttribute('class', 'serverUsername');

    const ipSpan = document.createElement('span');
    ipSpan.innerText = server.ipAddress;
    ipSpan.setAttribute('class', 'grey');

    detailsDiv.append(timeSpan || '', usernameStrong, ' ', ipSpan);
    serverDiv.append(serverName, ' ', status || '', joinBtn, detailsDiv);
    parentElement.appendChild(serverDiv);

    joinBtn.onclick = () => {
        if ((isConnected && confirm(`Joining this server will ${isHosting ? 'close' : 'leave'} your current server. Continue?`)) || !isConnected){
            if (isConnected) disconnectBtn.click();
            connectToServer(server.ipAddress, false);
        };
    };

    return serverDiv;
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
    
    //scroll to bottom of chatbox
    chatBox.scrollTop = chatBox.scrollHeight - chatBox.clientHeight;

    //caps the chatbox to 100 messages
    let messages = Array.from(document.getElementsByClassName('chatMessage')).slice(-100);
    chatBox.innerHTML = '';
    messages.forEach(msg => chatBox.appendChild(msg));
    
    if (notifMsg.checked) sendNotif(`${data.username}: ${data.data}`);
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

function toggleConnectionBtns(normal){
    controlPanel.style.display = normal ? 'block' : 'none';
    disconnectBtn.style.display = normal ? 'none' : 'inline-block';
    manualConnectDiv.style.display = normal ? 'block' : 'none';
    recentConnectionsDiv.style.display = normal ? 'block' : 'none';
    memberListDiv.style.display = normal ? 'none' : 'block';
    if (normal) {
        username.removeAttribute('readonly');
        infoServerAddress.innerText = getIpSubnet().ip;
        infoServerName.innerText = username.value;
        memberList.innerHTML = '';
    };
};

!function setupAutoupdating(){
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
}()

!function displayAppVersion(){
    const appVersion = g('appVersion');
    appVersion.innerText = `v${require("electron").remote.app.getVersion()}`;
}();

settingsIcon.onclick = () => settingsContainer.style.display = 'flex';
settingsContainer.onclick = event => {
    if (event.target === settingsContainer) settingsContainer.style.display = 'none';
};

!function setupSettings(){
    let settings = store.store;

    applySettings();
    function applySettings(){
        settings = store.store;

        username.value = settings.username || `Guest_${encryption.randStr(5)}`;
        fontSizeSlider.value = settings.fontSize;
        chatBox.style.fontSize = `${0.7 * fontSizeSlider.value}em`;
        fontSizeDisplay.innerText = `${settings.fontSize * 100}%`;
        autoStart.checked = settings.autoStart;
        flashFrame.checked = settings.flashFrame;
        ipcRenderer.send('flashFrame', flashFrame.checked);
        notifServerOnline.checked = settings.toastNotif.serverOnline;
        notifServerFound.checked = settings.toastNotif.serverFound;
        notifMsg.checked = settings.toastNotif.msg;
        deepScanBtn.style.display = settings.deepScan.doAuto ? 'none' : 'inline-block';
        doAutoDeepScan.checked = settings.deepScan.doAuto;
        autoDeepScanInt.disabled = !settings.deepScan.doAuto;
        autoDeepScanInt.value = settings.deepScan.interval;
    };

    //save settings
    const saveSettingsBtn = g('saveSettingsBtn'),
        resetSettingsBtn = g('resetSettingsBtn');

    saveSettingsBtn.onclick = () => {
        store.set({
            username: username.value || false,
            fontSize: fontSizeSlider.value,
            autoStart: autoStart.checked,
            flashFrame: flashFrame.checked,
            toastNotif: {
                serverOnline: notifServerOnline.checked,
                serverFound: notifServerFound.checked,
                msg: notifMsg.checked
            },
            deepScan: {
                doAuto: doAutoDeepScan.checked,
                interval: autoDeepScanInt.value
            }
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

    //auto deep scan
    let autoDeepScanId;
    if (doAutoDeepScan.checked) {
        deepScan();
        autoDeepScanId = setInterval(deepScan, Math.abs(autoDeepScanInt.value) * 1000);
    }
    doAutoDeepScan.oninput = () => {
        if (doAutoDeepScan.checked) {
            autoDeepScanInt.disabled = false;
            deepScanBtn.style.display = 'none';
            autoDeepScanId = setInterval(deepScan, Math.abs(autoDeepScanInt.value) * 1000);
        } else {
            autoDeepScanInt.disabled = true;
            deepScanBtn.style.display = 'inline-block';
            clearInterval(autoDeepScanId);
        }
    }
    autoDeepScanInt.onchange = () => {
        clearInterval(autoDeepScanId);
        autoDeepScanId = setInterval(deepScan, Math.abs(autoDeepScanInt.value) * 1000);
    }

    infoServerAddress.innerText = getIpSubnet().ip;
    infoServerName.innerText = username.value;
}();

let notif;
function sendNotif(body) {
    if (!document.hasFocus()){
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