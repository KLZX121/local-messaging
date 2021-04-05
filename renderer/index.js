//#region setup
const http = require('http');
const WebSocket = require('ws');

const { networkInterfaces } = require('os'); //used to get IP
const { ipcRenderer} = require('electron');

const Store = require('electron-store');
const defaults = {
    recentlyConnected: [],
    username: null,
    fontSize: 1,
    autoStart: false,
    endWhenFound: true,
    joinWhenFound: false,
    flashFrame: true
}
const store = new Store({defaults});

const g = document.getElementById.bind(document);
const hostBtn = g('hostBtn'),
    chatBox = g('chatBox'),
    infoStatus = g('infoStatus'),
    errorDisplay = g('errorDisplay'),
    searchServersBtn = g('searchServersBtn'),
    searchStatus = g('searchStatus'),
    disconnectBtn = g('disconnectBtn'),
    username = g('username'),
    infoHost = g('infoHost'),
    infoPort = g('infoPort'),
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
    flashFrame = g('flashFrame')

displayAppVersion();
setupAutoupdating();

let host, wss, server, clientWs;
let halt = false;
let searching = false;
const port = 121;
let recentlyConnected = store.get('recentlyConnected') || [];

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

hostBtn.addEventListener('click', hostServer);
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

function hostServer(){
    if (!username.value) {
        configError('Please enter a username');
        return;
    } else if (!navigator.onLine){
        configError('Not connected to a network');
        return;
    };

    host = getIp();

    infoStatus.innerHTML = 'Hosting';

    let history = [];
    let wsId = 1; //used to identify individual websockets

    server = http.createServer((req, res) => {res.end(username.value)}); //ends with host name so network scanning can show host's name
    server.on('error', error => {
        server.close(); 
        parseMessage(newMessage('system error', 'Local System', `There was an error hosting the server: ${error}`));
        infoStatus.innerHTML = 'Disconnected';
    });
    server.listen(port, host, setupWs);

    function setupWs(){ //sets up the websocket server 
        chatBox.innerHTML = '';
        parseMessage(newMessage('system', 'Local System', `Server hosted at http://${host}:${port}`));
        wss = new WebSocket.Server({
            server: server,
            clientTracking: true
        });
        wss.on('connection', (ws, request) => {

            heartbeat(ws);

            if (history.length > 0) {
                ws.send(newMessage('history', null, history)); //send chat history to connected websocket
            };
            ws.id = wsId++;
            ws.send(newMessage('data', null, ws.id)); //assigns an id to the websocket

            ws.on('message', message => { //handle incoming message from websocket
                if (JSON.parse(message).type === 'data'){ //save username and if host of the websocket
                    const data = JSON.parse(JSON.parse(message).data);

                    //check if duplicate username
                    wss.clients.forEach(client => {if (client.username === data.username) data.username += ` [${ws.id}]`;});

                    ws.username = data.username;
                    ws.isHost = data.isHost;

                    const msg = newMessage('system join', 'Global System', `${ws.username}${ws.isHost ? ' (host)' : ''} has joined`);
                    history.push(msg);
                    sendToAll(msg);

                    sendMemberList(); //updates the connected members list
                } else {
                    message = JSON.parse(message);
                    message.username = ws.username;
                    message = JSON.stringify(message);
                    history.push(message);
                    sendToAll(message);
                };
                history = history.slice(-100); //trims chat history to the latest 100
            });

            ws.on('close', (code, reason) => {
                if (reason) {
                    const msg = newMessage('system leave', 'Global System', `${ws.username} has left`);
                    history.push(msg);
                    sendToAll(msg);
                } else {
                    const msg = newMessage('system leave', 'Global System', `${ws.username} disconnected`);
                    history.push(msg);
                    sendToAll(msg);
                };
                sendMemberList();

                if (wss.clients.size === 0) {disconnectAll();};
            });

            function sendToAll(message){
                wss.clients.forEach(ws => ws.send(message))
            };
            function sendMemberList(){
                let members = [];
                wss.clients.forEach(ws => {
                    members.push({username: ws.username, isHost: ws.isHost, id: ws.id})
                });
                sendToAll(newMessage('memberList', null, members));
            };
        });
        connectToServer(true);
    };
};

function connectToServer(hoster, ip){
    if (searching) endSearch();
    searchBox.style.display = 'none';
    searchBox.innerHTML = '';
    infoStatus.innerHTML = 'Connecting';
    parseMessage(newMessage('system', 'Local System', `Connecting to ${ip}...`));

    if (!hoster){
        if (!username.value) {
            configError('Please enter a username');
            infoStatus.innerHTML = 'Disconnected';
            return;
        }  else if (!navigator.onLine){
            configError('Not connected to a network');
            infoStatus.innerHTML = 'Disconnected';
            return;
        };
        if (wss) wss.close();
        host = ip;
    };

    username.setAttribute('readonly', true);
    infoHost.innerHTML = host;
    infoPort.innerHTML = port;

    clientWs = new WebSocket(`http://${host}:${port}`);

    let timeout = setTimeout(disconnectAll, 10000); //disconnects websocket if it fails to connect within 10 seconds

    clientWs.on('error', error => {
        parseMessage(newMessage('system error', 'Local System', `There was an error connecting to the server: ${error}`));
    });

    clientWs.on('open', () => {
        chatBox.innerHTML = '';

        clearTimeout(timeout);
        infoStatus.innerHTML = 'Connected';
        parseMessage(newMessage('system', 'Local System', `Connected to http://${host}:${port}`));

        clientWs.send(newMessage('data', null, JSON.stringify({username: username.value, isHost: hoster ? true : false}))); //send username and if host to websocket server
    });

    clientWs.on('message', message => { //handle incoming message from websocket server
        message = JSON.parse(message);

        switch (message.type) {
            case 'history': //if receiving chat history
                message.data.forEach(data => {
                    parseMessage(data);
                });
                break;

            case 'memberList':
                memberList.innerHTML = '';

                message.data.forEach(member => {
                    const usernameSpan = document.createElement('span');
                    usernameSpan.setAttribute('class', 'connectionName');
                    usernameSpan.textContent = member.username;

                    const mainDiv = document.createElement('div');
                    mainDiv.appendChild(usernameSpan);
                    mainDiv.innerHTML += `${member.isHost ? ' (host)' : ''}${member.id === clientWs.id ? ' (you)' : ''}`;

                    memberList.appendChild(mainDiv);

                    if (member.isHost && member.id !== clientWs.id){ //adds the server to recently connected using the host's name and ip
                        recentlyConnected.unshift({hostName: member.username, ipAddress: host});

                        setupRecentlyConnected();
                    };
                });
                break;

            case 'data': //sets the websocket to the id assigned by the server
                clientWs.id = message.data;
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

    function sendMessage(event) { //send message to websocket server
        if (event.type === 'keydown' && (event.key !== 'Enter' || document.activeElement !== messageInput)) return;
        
        if (clientWs.readyState === 1 && messageInput.value.trim().length > 0){
            clientWs.send(newMessage('message', username.value || 'Guest', messageInput.value.trim()));
            messageInput.value = '';
        };
    };

    toggleConnectionBtns(false);
    disconnectBtn.onclick = disconnectAll;
};

function heartbeat(websocket){ //setup 'heartbeat' to make sure both sockets are connected
    let pingCounter = 0;

    const pingPong = () => {
        if (infoStatus.innerText === 'Disconnected') return;
        websocket.ping();
        if (++pingCounter === 5) {
            websocket.close();
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
        ipBtn.textContent = `${server.hostName} (${server.ipAddress})`;

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
    clientWs.close(1000, 'true');
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
                ipcRenderer.send('ping', true);
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
                        ipBtn.innerHTML = `${data.toString()} (${ip})`;
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
    
    ipcRenderer.send('ping', true);
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
        infoHost.innerHTML = '';
        infoPort.innerHTML = '';
        infoStatus.innerHTML = 'Disconnected';
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
                btn.innerText = `${data} (${server.ipAddress})`;
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
        fontSizeDisplay.innerText = `${settings.fontSize * 100}%`;
        endWhenFound.checked = settings.endWhenFound;
        joinWhenFound.checked = settings.joinWhenFound;
        endWhenFound.disabled = joinWhenFound.checked ? true : false;
        autoStart.checked = settings.autoStart;
        flashFrame.checked = settings.flashFrame;
        ipcRenderer.send('flashFrame', flashFrame.checked);
    };

    //save settings
    const saveSettingsBtn = g('saveSettingsBtn'),
        resetSettingsBtn = g('resetSettingsBtn');

    saveSettingsBtn.onclick = () => {
        store.set({
            username: username.value||null,
            fontSize: fontSizeSlider.value,
            autoStart: autoStart.checked,
            endWhenFound: endWhenFound.checked,
            joinWhenFound: joinWhenFound.checked,
            flashFrame: flashFrame.checked
        });
        ipcRenderer.send('autoStart', autoStart.checked);
    };
    resetSettingsBtn.onclick = () => {
        if (confirm('Reset ALL settings to default?')) {
            store.clear();
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