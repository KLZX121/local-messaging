const { networkData } = require('./networkData.js');

function getIpSubnet(){
    const networks = require('os').networkInterfaces();
    for (const type in networks) {
        if (['wi', 'fi'].every(el => type.toLowerCase().includes(el))) {
            const network = networks[type].filter(network => network.family === 'IPv4')[0];
            return {
                ip: network?.address,
                subnet: network?.netmask
            }
        } else {
            return false;
        };
    };
};

function networkSearch(port, callback, data = networkData(getIpSubnet().ip, getIpSubnet().subnet)){
    const Socket = require('net').Socket;

    function* gen(min = data.minOctet, max = data.maxOctet, rangeIncrement = data.rangeIncrement - 1){
        for (let i = min; i < max; null){
            inc = ((i + 10) <= max ? 10 : rangeIncrement % 10);
            yield [i, inc];
            i += rangeIncrement >= 10 ? inc : rangeIncrement;
        }
    }
    const genThirdOctet = gen();
    let genRes = genThirdOctet.next();

    let totalAddresses = [];

    if (data.subnettingOctetIndex < 3) {
        iterateConnect();
    } else {
        connect(data.ip.split('.')[2]).then(callback);
    }

    function iterateConnect() {
        let connectionNum = 0;
        for (let i = genRes.value[0]; i <= (genRes.value[0] + genRes.value[1]); i++) {
            connectionNum++;
            connect(i).then(addresses => {
                totalAddresses.push(addresses);
                genRes = genThirdOctet.next();
                
                if (genRes.done) {
                    if (--connectionNum === 0 && totalAddresses.length === data.rangeIncrement) callback(totalAddresses);
                } else {
                    iterateConnect();
                }
            });
        }
    }
    function connect(thirdOctet){
        return new Promise((resolve, reject) => {
            let found = [], socketNum = 0;
            
            //if subnetting octet is 3rd (index 2) then 
            for (let fourthOctet = (data.subnettingOctetIndex === 2 && thirdOctet === data.minOctet) ? 1 : 0; fourthOctet <= (data.subnettingOctetIndex === 2 ? (thirdOctet === data.maxOctet ? 254 : 255) : data.maxOctet); fourthOctet++) {
                
                const host = data.ip.split('.').slice(0, 2).join('.') + `.${thirdOctet}.${fourthOctet}`;

                const socket = new Socket();
                socketNum++;

                socket.connect(port, host);        
                let connected = false;
                socket.on('connect', () => {
                    connected = true;
                    socket.destroy();
                });
                socket.setTimeout(1500, () => {
                    socket.destroy();
                });
                socket.on('close', () => {
                    if (connected) found.push(host);
                    if (--socketNum === 0) resolve(found);
                });
            }
        });
    }
};

exports.getIpSubnet = getIpSubnet;
exports.networkSearch = networkSearch;