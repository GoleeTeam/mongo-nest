import {
    DynamicModule,
    Global,
    Inject,
    Logger,
    Module,
    OnApplicationBootstrap,
    OnApplicationShutdown,
    Provider,
} from '@nestjs/common';
import { ConnectionClosedEvent, ConnectionCreatedEvent, MongoClient, MongoClientOptions } from 'mongodb';
import { ModuleRef } from '@nestjs/core';
import { MongoModuleAsyncOptions, MongoOptions } from './types';

const DEFAULT_MONGO_NAME = 'DEFAULT_MONGO';
const MONGO_NAME_TOKEN = 'MONGO_NAME';

export const getMongoToken = (mongoName?: string) => {
    return mongoName || DEFAULT_MONGO_NAME;
};

export const InjectMongo = (mongoName?: string) => Inject(getMongoToken(mongoName));

@Global()
@Module({})
export class MongoModule implements OnApplicationBootstrap, OnApplicationShutdown {
    private static logger = new Logger(MongoModule.name);

    static forRoot(options: MongoOptions): DynamicModule {
        const mongoName = options.mongoName || DEFAULT_MONGO_NAME;
        const mongoOptions = options.mongoOptions || {};

        const ConnectionNameProvider: Provider = {
            provide: MONGO_NAME_TOKEN,
            useValue: mongoName,
        };

        const MongoClientProvider: Provider = {
            provide: this.getMongoToken(mongoName),
            useFactory: async (): Promise<any> => {
                return await MongoModule.clientOn(options.uri, mongoOptions).connect();
            },
        };

        MongoModule.logger.log(`Configuring, name: ${mongoName}, client options: ${JSON.stringify(mongoOptions)}`);
        return {
            module: MongoModule,
            providers: [MongoClientProvider, ConnectionNameProvider],
            exports: [MongoClientProvider],
        };
    }

    static forRootAsync(options: MongoModuleAsyncOptions, mongoName = DEFAULT_MONGO_NAME): DynamicModule {
        const ConnectionNameProvider: Provider = {
            provide: MONGO_NAME_TOKEN,
            useValue: mongoName,
        };

        const MongoClientProvider: Provider = {
            provide: this.getMongoToken(mongoName),
            useFactory: async (options: MongoOptions): Promise<any> => {
                const mongoOptions = options.mongoOptions || {};
                return await MongoModule.clientOn(options.uri, mongoOptions).connect();
            },
            inject: [this.getOptionProviderToken(mongoName)],
        };

        const optionsProvider = this.createAsyncOptionsProvider(options, mongoName);
        return {
            module: MongoModule,
            imports: options.imports,
            providers: [optionsProvider, MongoClientProvider, ConnectionNameProvider],
            exports: [MongoClientProvider],
        };
    }

    constructor(
        private readonly moduleRef: ModuleRef,
        @Inject(MONGO_NAME_TOKEN) private readonly mongoName: string,
    ) {}

    async onApplicationBootstrap() {
        MongoModule.logger.log(`Connecting: ${this.mongoName}`);
    }

    async onApplicationShutdown() {
        MongoModule.logger.log(`Disconnecting: ${this.mongoName}`);
        const client = this.moduleRef.get<MongoClient>(getMongoToken(this.mongoName));
        await client.close();
    }

    private static createAsyncOptionsProvider(options: MongoModuleAsyncOptions, connectionName: string): Provider {
        if (!options.useFactory) throw new Error('Missing useFactory in options');
        return {
            provide: this.getOptionProviderToken(connectionName),
            useFactory: options.useFactory,
            inject: options.inject || [],
        };
    }

    private static clientOn(uri: string, mongoOptions: MongoClientOptions) {
        return new MongoClient(uri, mongoOptions)
            .on('error', (error: Error) => {
                MongoModule.logger.error(`An error occurred. Cause: ${error.message}`);
            })
            .on('close', () => {
                MongoModule.logger.debug(`Client closed`);
            })
            .on('connectionCreated', (_: ConnectionCreatedEvent) => {
                MongoModule.logger.debug('Connection created');
            })
            .on('connectionClosed', (event: ConnectionClosedEvent) => {
                MongoModule.logger.debug(`Connection closed, reason: ${event.reason}`);
            });
    }

    private static getOptionProviderToken(connectionName = DEFAULT_MONGO_NAME): string {
        return `${connectionName}_OPTIONS`;
    }

    private static getMongoToken(mongoName: string) {
        return mongoName;
    }
}
