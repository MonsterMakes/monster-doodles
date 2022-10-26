const { Stack, RemovalPolicy } = require('aws-cdk-lib');
const { LambdaIntegration, RestApi } = require('aws-cdk-lib/aws-apigateway');
const iam = require("aws-cdk-lib/aws-iam");
const dynamodb = require('aws-cdk-lib/aws-dynamodb');
const lambda = require('aws-cdk-lib/aws-lambda');
const nodejsLambda = require('aws-cdk-lib/aws-lambda-nodejs');
const { DynamoEventSource } = require ('aws-cdk-lib/aws-lambda-event-sources');
const { Datadog } = require('datadog-cdk-constructs-v2');
const pathUtils = require('path');

class DynamodbStreamLagStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // dynamoDB table: 'EventSourceTable'
    const table = new dynamodb.Table(this, 'EventSourceTable', {
      tableName: 'EventSourceTable',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      // The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
      // the new table, and it will remain in your account until manually deleted. By setting the policy to
      // DESTROY, cdk destroy will delete the table (even if it has data in it)
      removalPolicy: RemovalPolicy.DESTROY, // NOT recommended for production code
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // secondary index on 'createdAt' attribute
    table.addLocalSecondaryIndex({
      indexName: 'statusIndex',
      sortKey: {name: 'createdAt', type: dynamodb.AttributeType.NUMBER},
      projectionType: dynamodb.ProjectionType.ALL,
    });
    
    console.log('table name 👉', table.tableName);
    console.log('table arn 👉', table.tableArn);

    // Lambda triggered by EventSourceTable dynamoDB Stream
    const eventSourceTableStreamHandlerLambda = new nodejsLambda.NodejsFunction(this, 'EventSourceTableStreamHandler', {
      entry: pathUtils.join(__dirname, '..','src','EventSourceTableStreamHandler.js'),
      handler: 'main',
      functionName: 'EventSourceTableStreamHandler',
      runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        externalModules: [
          'aws-sdk', // Use the 'aws-sdk' available in the Lambda runtime
        ],
      },
      //TODO hack for now as this is apart of the 'npm workspace'
      //yes I know this brings in way to many uneeded things
      //the solution is to package this as a docker image
      depsLockFilePath: pathUtils.join(__dirname, '..','..','..','..','package-lock.json'),
      environment: {
        PRIMARY_KEY: 'id',
        TABLE_NAME: table.tableName,
      },
    });
    // connect eventSourceTableStreamHandlerLambda up to the Event Source DynamoDB Stream
    eventSourceTableStreamHandlerLambda.addEventSource(new DynamoEventSource(table, {
      //TODO play with this to see what happens with Lambda errors
      // startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      startingPosition: lambda.StartingPosition.LATEST,
    }));

    // Setup Lambda to create an Event in DynamoDB
    const eventSourceCreateOneHandlerLambda = new nodejsLambda.NodejsFunction(this, 'eventSourceCreateOneHandler', {
      entry: pathUtils.join(__dirname, '..','src','EventSourceCreateOneHandler.js'),
      handler: 'main',
      functionName: 'EventSourceCreateOneHandler',
      runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        externalModules: [
          'aws-sdk', // Use the 'aws-sdk' available in the Lambda runtime
        ],
      },
      //TODO hack for now as this is apart of the 'npm workspace'
      //yes I know this brings in way to many uneeded things
      //the solution is to package this as a docker image
      depsLockFilePath: pathUtils.join(__dirname, '..','..','..','..','package-lock.json'),
      environment: {
        PRIMARY_KEY: 'id',
        TABLE_NAME: table.tableName,
      },
    });
    
    // Grant the Lambda function read access to the DynamoDB table
    table.grantReadWriteData(eventSourceCreateOneHandlerLambda);

    // Integrate the Lambda functions with the API Gateway resource
    const eventSourceCreateOneHandlerApiGatewayIntegration = new LambdaIntegration(eventSourceCreateOneHandlerLambda);

    // Create an API Gateway resource for each of the CRUD operations
    const api = new RestApi(this, 'itemsApi', {
      restApiName: 'Event Source Items Service'
    });

    const items = api.root.addResource('event-source-items');
    items.addMethod('POST', eventSourceCreateOneHandlerApiGatewayIntegration);

    //Configure Datadog Integration for both functions
    const datadogIntegration = new Datadog(this, "EventSourceDatadogIntegration", {
      nodeLayerVersion: '84',
      addLayers: true,
      extensionLayerVersion: '31',
      flushMetricsToLogs: true,
      site: 'datadoghq.com',
      apiKeySecretArn: 'arn:aws:secretsmanager:us-east-1:400294511740:secret:dynamodb-stream-lag/prototype-vyYDP8',
      enableDatadogTracing: true,
      enableDatadogLogs: true,
      injectLogContext: true,
      //logLevel: 'debug',//set to enable additional logging of Datadog Library/Extension
      env: `act:${Stack.of(this).account}__reg:${Stack.of(this).region}`,
      service: 'dynamodb-stream-lag',
      version: require(pathUtils.join(__dirname,'../package.json')).version,
    });
    datadogIntegration.addLambdaFunctions([
      eventSourceTableStreamHandlerLambda,
      eventSourceCreateOneHandlerLambda
    ]);

    //IAM permissions to get secret
    const DatadogApiKeySecretArn = 'arn:aws:secretsmanager:us-east-1:400294511740:secret:dynamodb-stream-lag/prototype-vyYDP8';
    const lambdaPolicyStatement = new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [DatadogApiKeySecretArn],
    });
    const getSecretsIamPolicy = new iam.Policy(this, 'get-secrets-policy', {
      statements: [lambdaPolicyStatement],
    });
    // add the lambda iam policy to eventSourceTableStreamHandlerLambda
    eventSourceTableStreamHandlerLambda.role?.attachInlinePolicy(getSecretsIamPolicy);
    // add the lambda iam policy to eventSourceCreateOneHandlerLambda
    eventSourceCreateOneHandlerLambda.role?.attachInlinePolicy(getSecretsIamPolicy);
  }
}

module.exports = { DynamodbStreamLagStack }
