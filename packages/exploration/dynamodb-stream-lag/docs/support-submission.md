Source can be seen at [monster-doodles](https://github.com/MonsterMakes/monster-doodles)

*DynamoDB Streams Lag Prototype Design:*
![DynamoDB Streams Lag Prototype](./resources/aws-topology.png)


This is a nodejs application using AWS CDK for managing the infrastructure. I am able to get some logging and basic telemetry. 

The problem is the APM data and majority of the logs do not help me in any way to understand what is going on in steps 1 through 5 in the picture above. 

I am really trying to understand the overall performance/timing across steps 1 through 5. What I imagine is being able to see steps 1-5 as a single trace in APM and have all of these components (API Gateway, 2 lambda functions and the DynamoDB Table) represented as a single "service".

I know I dont have anything instrumented correctly at this point as I
- do not see any Services in the "APM > Service List" 
- the traces that do show up show me isolated (not useful) spans such as
    - tcp.connect
    - dns.lookup
    - aws.dynamodb INSERT

There is so much good datadog documentation but I am striking out trying to figure out what is needed to accomplish my above goals. 

Any guidance would be greatly appreciated, thanks!