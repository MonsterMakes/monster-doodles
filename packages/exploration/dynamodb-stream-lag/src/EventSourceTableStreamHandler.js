const { LambdaLog } = require('lambda-log'); 
const logger = new LambdaLog();
logger.options.debug = true;

const TABLE_NAME = process.env.TABLE_NAME || 'EventSourceTable';
const PRIMARY_KEY = process.env.PRIMARY_KEY || 'id';

async function handleRecord (record) {
  logger.debug(`Processing ${TABLE_NAME} stream record...`, {
    record, 
    lambdaTime: Date.now()
  });
}

async function main (event, context, callback) {
  logger.debug(`${TABLE_NAME} stream handler initiated...`, {
    lambdaEvent: event, 
    lambdaContext: context,
    lambdaTime: Date.now()
  });

  for (const r of event.Records) {
    await handleRecord(r);
  }

  callback(null);
};
  
module.exports = { main };