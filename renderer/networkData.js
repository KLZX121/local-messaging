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

exports.networkData = networkData;