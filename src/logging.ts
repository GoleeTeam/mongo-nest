import { Logger } from '@nestjs/common';
import { ConnectionClosedEvent, ConnectionCreatedEvent, MongoClient } from 'mongodb';

export class Logging {
    private logger = new Logger(Logging.name);

    public on(client: MongoClient) {
        client
            .on('error', (error: Error) => {
                this.logger.error(`An error occurred. Cause: ${error.message}`);
            })
            .on('close', () => {
                this.logger.debug(`Client closed`);
            })
            .on('connectionCreated', (_: ConnectionCreatedEvent) => {
                this.logger.debug('Connection created');
            })
            .on('connectionClosed', (event: ConnectionClosedEvent) => {
                this.logger.debug(`Connection closed, reason: ${event.reason}`);
            });
    }
}
