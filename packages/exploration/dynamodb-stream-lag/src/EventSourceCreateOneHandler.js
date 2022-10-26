const DocumentClient = require('aws-sdk').DynamoDB.DocumentClient;
const uuidv4 = require('uuid').v4;
const { LambdaLog } = require('lambda-log'); 
const logger = new LambdaLog();
logger.options.debug = true;

const TABLE_NAME = process.env.TABLE_NAME || 'EventSourceTable';
const PRIMARY_KEY = process.env.PRIMARY_KEY || 'id';

const RESERVED_RESPONSE = `Error: You're using AWS reserved keywords as attributes`;
const DYNAMODB_EXECUTION_ERROR = `Error: Execution update, caused a Dynamodb error, please take a look at your application Logs.`;

const db = new DocumentClient();

async function main(event, context) {
  const initiatedTime = Date.now();
  logger.debug(`EventSourceCreateOne handler initiated...`, {
    lambdaEvent: event, 
    lambdaContext: context,
    lambdaTime: initiatedTime
  });
  const item = {
    id: uuidv4(),
    createdAt: initiatedTime,
  };
  const params = {
    TableName: TABLE_NAME,
    Item: item,
  };

  try {
    logger.debug('Creating Event Source Item...)',{
      item, 
      lambdaTime: Date.now()
    });
    
    await db.put(params).promise();

    logger.debug('Event Source Item recorded in db.',{
      item, 
      lambdaTime: Date.now()
    });
    return { statusCode: 201, body: JSON.stringify(item) };
  
  } catch (dbError) {
    logger.error(dbError);
    
    const errorResponse =
      dbError.code === "ValidationException" &&
      dbError.message.includes("reserved keyword")
        ? DYNAMODB_EXECUTION_ERROR
        : RESERVED_RESPONSE;
    return { statusCode: 500, body: JSON.stringify(errorResponse) };
  }
}

module.exports = { main };
