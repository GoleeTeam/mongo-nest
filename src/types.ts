import { ModuleMetadata } from '@nestjs/common';
import { MongoClientOptions } from 'mongodb';

export interface MongoOptions {
    uri: string;
    mongoName?: string;
    mongoOptions?: MongoClientOptions;
    observable?: boolean;
}

export interface MongoModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    useFactory?: (...args: any[]) => Promise<MongoOptions> | MongoOptions;
    inject?: any[];
}
