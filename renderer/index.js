//#region setup
const http = require('http');
const WebSocket = require('ws');

const { networkInterfaces } = require('os'); //used to get IP
const { ipcRenderer} = require('electron');

const Store = require('electron-store');
const store = new Store();

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
    endWhenFoundDiv = g('endWhenFoundDiv'),
    manualConnect = g('manualConnect'),
    manualConnectBtn = g('manualConnectBtn'),
    manualHost = g('manualHost'),
    messageInput = g('messageInput'),
    memberList = g('memberList'),
    memberListDiv = g('memberListDiv'),
    joinWhenFound = g('joinWhenFound'),
    joinWhenFoundDiv = g('joinWhenFoundDiv'),
    wifi = g('wifi'),
    recentConnections = g('recentConnections'),
    recentConnectionsDiv = g('recentConnectionsDiv'),
    sendMessageBtn = g('sendMessageBtn');

displayAppVersion();
setupAutoupdating();

let host, wss, server, clientWs;
let halt = false;
let searching = false;
const port = 121;
let recentlyConnected = [];

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

username.value = store.get('username') || `Guest_${generateid(5)}`;

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

if (store.get('recentlyConnected')){
    store.get('recentlyConnected').forEach(server => {
        const ipBtn = document.createElement('button');
        ipBtn.textContent = `${server.host} (${server.ip})`;
        recentConnections.appendChild(ipBtn);
        ipBtn.onclick = () => connectToServer(false, server.ip);
    });
}
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
        parseMessage(JSON.parse(newMessage('system error', 'Local System', `There was an error hosting the server: ${error}`)));
        infoStatus.innerHTML = 'Disconnected';
    });
    server.listen(port, host, setupWs);

    function setupWs(){ //sets up the websocket server 
        chatBox.innerHTML = '';
        parseMessage(JSON.parse(newMessage('system', 'Local System', `Server hosted at http://${host}:${port}`)));
        wss = new WebSocket.Server({
            server: server,
            clientTracking: true
        });
        wss.on('connection', (ws, request) => {

            if (history.length > 0) {
                ws.send(newMessage('history', null, history)); //send chat history to connected websocket
            };
            ws.id = wsId++;
            ws.send(newMessage('data', null, ws.id)); //assigns an id to the websocket

            ws.on('message', message => { //handle incoming message from websocket
                if (JSON.parse(message).type === 'data'){ //save username and if host of the websocket
                    const data = JSON.parse(JSON.parse(message).data);

                    ws.username = data.username;
                    ws.host = data.host;

                    const msg = newMessage('system join', 'Global System', `${ws.username}${ws.host ? ' (host)' : ''} has joined`);
                    history.push(msg);
                    sendToAll(msg);

                    sendMemberList(); //updates the connected members list
                } else{
                    history.push(message);
                    sendToAll(message);
                };
                history = history.slice(-100); //trims chat history to the latest 100
            });

            ws.on('close', (code, reason) => {
                if (reason) {
                    const msg = newMessage('system leave', 'Global System', `${reason} has left`);
                    history.push(msg);
                    sendToAll(msg);
                } else {
                    const msg = newMessage('system leave', 'Global System', `${ws.username} disconnected`);
                    history.push(msg);
                    sendToAll(msg);
                };
                sendMemberList();
            });

            function sendToAll(message){
                wss.clients.forEach(ws => ws.send(message))
            };
            function sendMemberList(){
                let members = [];
                wss.clients.forEach(ws => {
                    members.push({username: ws.username, host: ws.host, id: ws.id})
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
    chatBox.innerText += `Connecting to ${ip}...`

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
        parseMessage(JSON.parse(newMessage('system error', 'Local System', `There was an error connecting to the server: ${error}`)));
    });

    clientWs.on('open', () => {
        chatBox.innerHTML = '';

        clearTimeout(timeout);
        infoStatus.innerHTML = 'Connected';
        
        parseMessage(JSON.parse(newMessage('system', 'Local System', `Connected to http://${host}:${port}`)));

        clientWs.send(newMessage('data', null, JSON.stringify({username: username.value, host: hoster ? true : false}))); //send username and if host to websocket server
        store.set('username', username.value);
    });

    clientWs.on('message', message => { //handle incoming message from websocket server
        message = JSON.parse(message);

        switch (message.type) {
            case 'history': //if receiving chat history
                message.data.forEach(data => {
                    data = JSON.parse(data);
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
                    mainDiv.innerHTML += `${member.host ? ' (host)' : ''}${member.id === clientWs.id ? ' (you)' : ''}`;

                    memberList.appendChild(mainDiv);

                    if (member.host && member.id !== clientWs.id){ //adds the server to recently connected using the host's name and ip
                        recentlyConnected = recentlyConnected.filter(value => value.ip !== host);
                        recentlyConnected.push({host: member.username, ip: host});
                        recentlyConnected = recentlyConnected.slice(-5);

                        recentConnections.innerHTML = '';

                        recentlyConnected.forEach(server => {
                            const ipBtn = document.createElement('button');
                            ipBtn.textContent = `${server.host} (${server.ip})`;
                            recentConnections.appendChild(ipBtn);
                            ipBtn.onclick = () => connectToServer(false, server.ip);
                        });
                        store.set('recentlyConnected', recentlyConnected);
                    };
                });
                break;

            case 'data': //sets the websocket to the id assigned by the server
                clientWs.id = message.data;
                break;

            default: 
                parseMessage(message);
        };
    });

    clientWs.on('close', () => {
        parseMessage(JSON.parse(newMessage('system leave', 'Local System', 'Connection closed')));
        toggleConnectionBtns(true);
    });

    document.onkeydown = sendMessage;
    sendMessageBtn.onclick = event => sendMessage(event, true);

    function sendMessage(event, click){ //send message to websocket server
        if (event.type === 'keydown' && (event.key !== 'Enter' || document.activeElement !== messageInput)) return;
        
        if (clientWs.readyState === 1 && messageInput.value.trim().length > 0){
            clientWs.send(newMessage('message', username.value || 'Guest', messageInput.value.trim()));
            messageInput.value = '';
        };
    };

    toggleConnectionBtns(false);
    disconnectBtn.onclick = disconnectAll;

    
};
function disconnectAll(){
    if (wss) {
        wss.close();
        server.close();
        console.log(wss, server);
    };
    clientWs.close(1000, username.value);
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
function trimMessages(){
    let messages = Array.from(document.getElementsByClassName('chatMessage')).slice(-100);
    chatBox.innerHTML = '';
    messages.forEach(msg => chatBox.appendChild(msg));
}
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
    endWhenFoundDiv.style.display = normal ? 'block' : 'none';
    joinWhenFoundDiv.style.display = normal ? 'block' : 'none';
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