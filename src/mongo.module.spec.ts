import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getMongoToken, InjectMongo, MongoModule } from './mongo.module';

import { OpenTelemetryModule } from '@golee/nestjs-otel';
import { metrics } from '@opentelemetry/api';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';

@Injectable()
class DefaultProvider {
    constructor(@InjectMongo() public readonly mongoClient: MongoClient) {}
}

@Injectable()
class CustomProvider {
    constructor(@InjectMongo('foo') public readonly mongoClient: MongoClient) {}
}

class TestMetricReader extends MetricReader {
    protected onForceFlush(): Promise<void> {
        return Promise.resolve(undefined);
    }

    protected onShutdown(): Promise<void> {
        return Promise.resolve(undefined);
    }
}

describe('Mongo module', () => {
    let mongodb: MongoMemoryServer;

    beforeAll(async () => {
        mongodb = await MongoMemoryServer.create({});
    });

    afterAll(async () => {
        await mongodb.stop();
    });

    describe('forRoot', () => {
        describe('default connection name', () => {
            let module: TestingModule;

            beforeAll(async () => {
                module = await Test.createTestingModule({
                    providers: [DefaultProvider],
                    imports: [
                        MongoModule.forRoot({
                            uri: mongodb.getUri(),
                        }),
                    ],
                }).compile();
            });

            afterAll(async () => {
                await module.close();
            });

            it('should create a mongo client provider', async () => {
                const mongoClient = await module.resolve(getMongoToken());
                expect(mongoClient).toBeDefined();
            });

            it('should inject the mongo client', async () => {
                const fooProvider = await module.resolve(DefaultProvider);
                expect(fooProvider.mongoClient).toBeDefined();
            });
        });

        describe('custom connection name', () => {
            let module: TestingModule;
            beforeAll(async () => {
                module = await Test.createTestingModule({
                    providers: [CustomProvider],
                    imports: [
                        MongoModule.forRoot({
                            uri: mongodb.getUri(),
                            mongoName: 'foo',
                        }),
                    ],
                }).compile();
            });

            afterAll(async () => {
                await module.close();
            });

            it('should create a mongo client provider', async () => {
                const mongoClient = await module.resolve(getMongoToken('foo'));
                expect(mongoClient).toBeDefined();
            });

            it('should inject the mongo client', async () => {
                const fooProvider = await module.resolve(CustomProvider);
                expect(fooProvider.mongoClient).toBeDefined();
            });
        });

        describe('observability', () => {
            let module: TestingModule;
            let reader: TestMetricReader;

            beforeAll(async () => {
                reader = new TestMetricReader();
                metrics.setGlobalMeterProvider(
                    new MeterProvider({
                        readers: [reader],
                    }),
                );

                module = await Test.createTestingModule({
                    providers: [DefaultProvider],
                    imports: [
                        MongoModule.forRoot({
                            uri: mongodb.getUri(),
                            observable: true,
                        }),
                        OpenTelemetryModule.forRoot(),
                    ],
                }).compile();
            });

            afterAll(async () => {
                await module.close();
                await reader.shutdown();
            });

            it('should register duration', async () => {
                const mongoClient = await module.resolve<MongoClient>(getMongoToken());
                await mongoClient.db().collection('foos').countDocuments();

                const metric = await currentMetric();

                expect(metric.descriptor.name).toBe('db.client.operation.duration');
                expect(metric.dataPoints).toContainEqual(
                    expect.objectContaining({
                        attributes: expect.objectContaining({ 'db.system': 'mongodb' }),
                    }),
                );
            });

            it('should track insert', async () => {
                const mongoClient = await module.resolve<MongoClient>(getMongoToken());
                await mongoClient.db().collection('foos').insertOne({ name: 'Foo' });

                const metric = await currentMetric();

                expect(metric.dataPoints).toContainEqual(
                    expect.objectContaining({
                        attributes: expect.objectContaining({ 'db.operation.name': 'insert' }),
                    }),
                );
            });

            it('should track find', async () => {
                const mongoClient = await module.resolve<MongoClient>(getMongoToken());
                await mongoClient.db().collection('foos').findOne({ name: 'Foo' });

                const metric = await currentMetric();

                expect(metric.dataPoints).toContainEqual(
                    expect.objectContaining({
                        attributes: expect.objectContaining({ 'db.operation.name': 'find' }),
                    }),
                );
            });

            async function currentMetric() {
                const { resourceMetrics } = await reader.collect();
                return resourceMetrics.scopeMetrics[0].metrics[0];
            }
        });
    });

    describe('forRootAsync', () => {
        describe('default connection name', () => {
            let module: TestingModule;

            beforeAll(async () => {
                module = await Test.createTestingModule({
                    providers: [DefaultProvider],
                    imports: [
                        MongoModule.forRootAsync({
                            useFactory: async () => ({
                                uri: mongodb.getUri(),
                            }),
                        }),
                    ],
                }).compile();
            });

            afterAll(async () => {
                await module.close();
            });

            it('should create a mongo client provider', async () => {
                const mongoClient = await module.resolve(getMongoToken());
                expect(mongoClient).toBeDefined();
            });

            it('should inject the mongo client', async () => {
                const fooProvider = await module.resolve(DefaultProvider);
                expect(fooProvider.mongoClient).toBeDefined();
            });
        });

        describe('custom connection name', () => {
            let module: TestingModule;

            beforeAll(async () => {
                module = await Test.createTestingModule({
                    providers: [CustomProvider],
                    imports: [
                        MongoModule.forRootAsync(
                            {
                                useFactory: async () => ({
                                    uri: mongodb.getUri(),
                                }),
                            },
                            'foo',
                        ),
                    ],
                }).compile();
            });

            afterAll(async () => {
                await module.close();
            });

            it('should create a mongo client provider', async () => {
                const mongoClient = await module.resolve(getMongoToken('foo'));
                expect(mongoClient).toBeDefined();
            });

            it('should inject the mongo client', async () => {
                const fooProvider = await module.resolve(CustomProvider);
                expect(fooProvider.mongoClient).toBeDefined();
            });
        });
    });
});
