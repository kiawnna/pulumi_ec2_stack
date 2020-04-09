# Secure ECS Service App stack with autoscaling and loadblanacing via Pulumi Platform

This project will create a new app from a an AWS AMI set up on EC2 instances.
The app created will be automatically load-balanced and auto-scaled. All
underlying infrastructure, including a vpc, subnets, security groups, ECS clusters, load-balancers,
autosclaing group for your EC2 instances, listeners, listerner rules and target groups, will be
automatically provisioned for you when you deploy. The autoscaling policy in place is set up as a
percentage of CPU Utilization.

This project runs on Pulumi, a free opensource cloudformation platform similar to Terraform,
Ansible, and the AWS-CDK. We chose Pulumi because it is cloud agnostic, more intuitive than Terraform
and Ansible, and takes fewer lines of code to create complex infrastructure than other platforms.

The first time this project is set up and deployed it should take you 20 minutes or less, depending on
comfort working with AWS and scripts. The initial setup only happens once, and from there every new app
afterward only uses Step 3 (from below) and then the command `make deploy`. That means for that every
new API that needs to be launched will take less than 5 minutes to get deployed.

# Prerequisites:
Before the Getting Started section, make sure you have made an AWS AMI chosen.
You will need to copy the ami-id into index.ts file.
You also need to create a free
Pulumi account early on as new accounts can take a few hours to validate.

# Getting Started:
Below is a quick outline of the steps needed to deploy your first app using this Pulumi template.

## INITIALLY:
Do all 5 steps the first time you set up an app.
## NEW APPS:
Only do Step 3 and the command `make deploy`.

### Step 1: Certificate and New Paramter
- Create a certificate for your domain and a new standard-string parameter for the following value: '/aiAPI/certArn'.
- '/aiAPI/certArn' should be a verified AWS Certificate Manager certificate, to enable HTTPS traffic through your
load balancer.
- Request a certificate and validate it through EMAIL or DNS. Once it is validated, copy the ARN of the
certificate and go to AWS Systems Manager. Create a new Standard String Parameter called '/aiAPIcertArn' (spelling
and capitalization is important). Paste the arn you copied into the value field and create the parameter.

### Step 2: New Pulumi Stack and Update makefile
- Create a new Pulumi stack in the Pulumi dashboard. Copy this stack name into your makefile and your Pulumi.yaml file.
- Create a new acecss roken and copy it (you will only see it once) into the makefile.
- In the makefile, you also need to update the Pulumi owner field and the stack name field to yourself and the name
of the new stack you just created, respectively.

### Step 3: Update the index.ts file to have the correct values specific to your app
- Go to the index.ts file and update the following fields: 
-  domainName
    - all the values under const apps
        - name: string--the name of your app
        - healthCheckPath: string--the path of your healthcheck
        - port: string--the port serving your app
        - ami_id:string--the AWS AMI id for your app
        - desiredCapacity: number--the desired number of instances you want running
        - minNumInstances: number--the minimum number of instances you want running
        - maxNumInstances: number--the maximum number of instances you want running
        - targetPercentCPUUtilization: number--the percentage of CPU that is used before spinning up a new instance
        - ebsVolumeSize: the EBS volume size needed for your AMI

### Step 4: Run the following commands from your makefile, in the order listed:
```
make prepare
```
This command will install pulumi and all the dependicies this app needs to run
```
make login
```
This command will log you in to Pulumi using the account name and access token you provided in a previous step. 
```
make deploy
```
This command will deploy your app and all the necessary AWS resources.

### Step 5: Create a subdomain and point it at the loadbalancer
- Create a subdomain (in AWS Route53 if that is what you use) and point it at the loadbalancer that was just created.
To do this in AWS Route53, go to your Hosted Zones and create a new record set. Check "Yes" for Alias and in the drop down
list the name of your loadbalancer should appear.