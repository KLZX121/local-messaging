function networkData(ip, subnetMask){
    const binaryValues = [128, 64, 32, 16, 8, 4, 2, 1];
    let data = {
        ip,
        subnetMask,
        binarySubnetMask: '0.0.0.0',
        CIDRNotation: 0,
        numberOfHosts: 0,
        minHost: '0.0.0.0',
        maxHost: '0.0.0.0',
        rangeIncrement: 0, //the range which usable hosts are within
        subnettingOctetIndex: 0, //the octet (0,1,2,3) which the network is subnetting on
        minOctet: 0, //minimum value of the octet which is being subnetted on
        maxOctet: 0 //maximum value of the octet which is being subnetted on
    };

    //find number of hosts
    let binarySubnetMask = [];
    subnetMask.split('.').forEach(octet => {
        octet = parseInt(octet).toString(2);
        while (octet.length < 8) octet += '0';
        binarySubnetMask.push(octet);
    });
    data.binarySubnetMask = binarySubnetMask.join('.');
    data.numberOfHosts = 2 ** (data.binarySubnetMask.split('0').length - 1) - 2;

    //find CIDR notation
    data.CIDRNotation = (data.binarySubnetMask.match(/1/g) || []).length;
    data.rangeIncrement = (binaryValues[(data.CIDRNotation % 8) - 1] || 256);

    //work out host range
    data.subnettingOctetIndex = (subnetMask.match(/255/g) || []).length;
    ip = ip.split('.');
    data.minHost = ip.slice(0, data.subnettingOctetIndex + 1);
    data.maxHost = ip.slice(0, data.subnettingOctetIndex + 1);
    const subnetOctet = ip[data.subnettingOctetIndex]; //octet value which is subnetted
    for (let i = 0; i <= 255; i += data.rangeIncrement) { //increment in host range to find range which given ip is in
        if (subnetOctet >= i && subnetOctet < (i + data.rangeIncrement)) { //if the octet value is within the range
            data.minHost[data.subnettingOctetIndex] = i;
            data.maxHost[data.subnettingOctetIndex] = (i + data.rangeIncrement) - (data.subnettingOctetIndex === 3 ? 0 : 1);
            //if (/^(255|0).(255|0).(255|0).(255|0)$/.test(data.subnetMask)) data.maxHost[data.subnettingOctetIndex]++;
            while (data.minHost.length < 4) data.minHost.push('0');
            while (data.maxHost.length < 4) data.maxHost.push('255');
            data.minHost[3]++;
            data.maxHost[3]--;
            if (data.maxHost[3] === 255) data.maxHost[3]--;
            data.minOctet = data.minHost[data.subnettingOctetIndex];
            data.maxOctet = data.maxHost[data.subnettingOctetIndex];
            data.minHost = data.minHost.join('.');
            data.maxHost = data.maxHost.join('.');
            return data;
        };
    };
};

function getIpSubnet(){
    const networks = require('os').networkInterfaces();
    for (const type in networks) {
        if (['wi', 'fi'].every(el => type.toLowerCase().includes(el))) {
            const network = networks[type].filter(network => network.family === 'IPv4')[0];
            return {
                ip: network?.address,
                subnet: network?.netmask
            }
        }
    };
    throw 'No network found';
};

function networkSearch(port, callback){
    let data;
    try {
        data = networkData(getIpSubnet().ip, getIpSubnet().subnet) 
    } catch (error) { 
        throw error; 
    }
    
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