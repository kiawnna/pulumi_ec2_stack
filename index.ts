import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import {SSM} from 'aws-sdk';
import { AutoScalingGroup } from "@pulumi/awsx/autoscaling";

// INITIAL Create SSM Parameters for these values: ['/aiAPI/certArn', '/aiAPI/exampleEcrUrl']
// '/aiAPI/certArn' should be a verified AWS Certificate Manager certificate, to enable HTTPS traffic through your load
const region = 'us-east-1'


const ssm = new SSM({
    region: region
});

interface ssmObjectParams {
    certArn: string
};

const ssmObject: ssmObjectParams = {
    certArn: ''
};

// INITIAL set domainName to your domain name that will be pointed at a load balancer
const domainName = 'your-domain-name-here'
const instanceType = 't2.medium'

// NEW_APP Copy a JSON object and give it new application-specific values
const apps = [
    {
        name: 'app-name-goes-here',
        healthCheckPath: '/healthcheckpathhere',
        port: 'port-as-a-string',
        ami_id: 'id-of-ami',
        desiredCapacity: 3,
        minNumInstances: 1,
        maxNumInstances: 5,
        targetPercentCPUUtilization: 75,
        ebsVolumeSize: 50
    },
    {
        name: 'second-app-name-goes-here',
        healthCheckPath: '/healthcheckpathhere',
        port: 'port-as-a-string',
        ami_id: 'id-of-ami',
        desiredCapacity: 3,
        minNumInstances: 1,
        maxNumInstances: 5,
        targetPercentCPUUtilization: 75,
        ebsVolumeSize: 50
    }
];

async function getParameters(path: string) {
    let ssmEnvParams: SSM.GetParametersByPathRequest;
    ssmEnvParams = {
        Path: path,
    };
    const ssmEnvParameters = await ssm.getParametersByPath(ssmEnvParams).promise();

    // @ts-ignore
    ssmEnvParameters.Parameters.map(x => {
        // @ts-ignore
        ssmObject[x.Name.replace('/aiAPI/', '')] = x.Value
    });
}

async function main() {

    await getParameters('/aiAPI');

    const vpc = new awsx.ec2.Vpc("aiApi", {
        cidrBlock: "10.200.0.0/16",
        numberOfAvailabilityZones: 2,
        subnets: [
            {type: "public", name: "loadbalancer"},
            {type: "private", name: "instances",},
        ]
    });

    const loadBalancerSecurityGroup = new awsx.ec2.SecurityGroup("loadbalancer", {vpc});

    loadBalancerSecurityGroup.createIngressRule("web-access", {
        location: {cidrBlocks: ["0.0.0.0/0"]},
        ports: new awsx.ec2.TcpPorts(443),
        description: "allow web traffic"
    });
    
    loadBalancerSecurityGroup.createIngressRule("http-access", {
        location: {cidrBlocks: ["0.0.0.0/0"]},
        ports: new awsx.ec2.TcpPorts(80),
        description: "allow web traffic"
    });
    
    loadBalancerSecurityGroup.createEgressRule("all-access", {
        location: {cidrBlocks: ["0.0.0.0/0"]},
        ports: new awsx.ec2.AllTraffic,
        description: "allow web traffic"
    });

    const ec2InstanceSecurityGroup = new awsx.ec2.SecurityGroup("api-instances", {vpc});

    ec2InstanceSecurityGroup.createIngressRule("all-access", {
        location: {cidrBlocks: ["0.0.0.0/0"]},
        ports: new awsx.ec2.TcpPorts(80),
        description: "allow web traffic"
    });
    
    ec2InstanceSecurityGroup.createEgressRule("outbound-access", {
        location: {cidrBlocks: ["0.0.0.0/0"]},
        ports: new awsx.ec2.AllTraffic,
        description: "allow web traffic"
    });

    const defaultSubnetGroup = new aws.rds.SubnetGroup("api-subnetgroup-public", {
        subnetIds: vpc.publicSubnetIds,
        tags: {
            Name: "API public Subnet Group",
        },
    });

    const privateSubnetGroup = new aws.rds.SubnetGroup("api-subnetgroup-private", {
        subnetIds: vpc.privateSubnetIds,
        tags: {
            Name: "API private Subnet Group",
        },
    });
   
    const alb = new awsx.lb.ApplicationLoadBalancer("lb", {
        securityGroups: [loadBalancerSecurityGroup.id],
        subnets: vpc.publicSubnetIds,
        vpc,
    });

    const httpListener = alb.createListener(`redirecthttp`, {
        port: 80,
        protocol: "HTTP",
        defaultAction: {
            type: "redirect",
            redirect: {
                protocol: "HTTPS",
                port: "443",
                statusCode: "HTTP_301",
            },
        },
    });
    
    const newlistener = alb.createListener(`listener`, {
        port: 443,
        external: true,
        certificateArn: ssmObject.certArn
    });

    apps.forEach((x, i) => {
        let tg = alb.createTargetGroup(`${x.name}tg`, {protocol: 'HTTP', targetType: "instance", port: parseInt(x.port), healthCheck: {path: x.healthCheckPath, port: x.port}});

        let listenerRule = new aws.lb.ListenerRule(`${x.name}listenerRule`, {
            actions: [{
                targetGroupArn: tg.targetGroup.arn,
                type: "forward",
            }],
            conditions: [
                {
                    hostHeader: {
                        values: [`${x.name.toLowerCase()}.${domainName}`],
                    },
                },
            ],
            listenerArn: newlistener.listener.arn
        });

        let launchconfiguration = new aws.ec2.LaunchConfiguration(`${x.name}LC`, { instanceType: instanceType, imageId: x.ami_id, name: `ec2-${x.name}-LC`, securityGroups: [ec2InstanceSecurityGroup.id], rootBlockDevice: {volumeSize: x.ebsVolumeSize}})
        
        let autoscalinggroup = new aws.autoscaling.Group(`${x.name}asg`, {
            availabilityZones: [`${region}a`, `${region}b`],
            healthCheckGracePeriod: 25,
            healthCheckType: 'EC2',
            desiredCapacity: x.desiredCapacity,
            launchConfiguration: launchconfiguration,
            minSize: x.minNumInstances,
            maxSize: x.maxNumInstances,
            targetGroupArns: [tg.targetGroup.arn],
            vpcZoneIdentifiers: vpc.privateSubnetIds
        });
        
        let asgpolicy = new aws.autoscaling.Policy(`${x.name}asg-policy`, {
            adjustmentType: "ExactCapacity",
            autoscalingGroupName: autoscalinggroup.name,
            name: 'CPUUtilization',
            policyType: 'TargetTrackingScaling',
            targetTrackingConfiguration: {
                targetValue: x.targetPercentCPUUtilization,
                predefinedMetricSpecification: {
                    predefinedMetricType: 'ASGAverageCPUUtilization'
                }
            },
        });

    });
}

main();