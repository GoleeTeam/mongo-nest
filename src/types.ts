import { ModuleMetadata } from '@nestjs/common';
import { MongoClientOptions } from 'mongodb';

export interface MongoOptions {
    uri: string;
    mongoName?: string;
    mongoOptions?: MongoClientOptions;
}

export interface MongoModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    useFactory?: (...args: any[]) => Promise<Omit<MongoOptions, 'mongoName'>> | MongoOptions;
    inject?: any[];
}
