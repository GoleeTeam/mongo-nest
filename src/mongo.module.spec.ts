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
    let reader: TestMetricReader;

    beforeAll(async () => {
        mongodb = await MongoMemoryServer.create({});
        reader = new TestMetricReader();
        metrics.setGlobalMeterProvider(
            new MeterProvider({
                readers: [reader],
            }),
        );
    });

    afterAll(async () => {
        await mongodb.stop();
        await reader.shutdown();
    });

    async function currentMetric() {
        const { resourceMetrics } = await reader.collect();
        return resourceMetrics.scopeMetrics[0].metrics[0];
    }

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
                const mongoClient = await module.resolve<MongoClient>(getMongoToken());
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
                const mongoClient = await module.resolve<MongoClient>(getMongoToken('foo'));
                expect(mongoClient).toBeDefined();
            });

            it('should inject the mongo client', async () => {
                const fooProvider = await module.resolve(CustomProvider);
                expect(fooProvider.mongoClient).toBeDefined();
            });
        });

        describe('observability', () => {
            let module: TestingModule;

            beforeAll(async () => {
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
            });

            it('should register duration', async () => {
                const mongoClient = await module.resolve<MongoClient>(getMongoToken());
                await mongoClient.db().collection('foos').countDocuments();

                const metric = await currentMetric();

                expect(metric.descriptor.name).toBe('db.client.operation.duration');
                expect(metric.dataPoints).toContainEqual(
                    expect.objectContaining({
                        attributes: expect.objectContaining({ 'db.system.name': 'mongodb' }),
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
                await mongoClient.db().collection('foos').findOne();

                const metric = await currentMetric();

                expect(metric.dataPoints).toContainEqual(
                    expect.objectContaining({
                        attributes: expect.objectContaining({ 'db.operation.name': 'find' }),
                    }),
                );
            });

            it('should track execution time', async () => {
                const mongoClient = await module.resolve<MongoClient>(getMongoToken());
                await mongoClient.db().collection('foos').insertOne({ name: 'Foo' });
                await mongoClient.db().collection('foos').findOne({ $where: 'sleep(2500) || true' });

                const metric = await currentMetric();

                expect(metric.dataPoints.map((x: any) => x.value.max)).toContainEqual(expect.closeTo(2.5, 1));
            });
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
                const mongoClient = await module.resolve<MongoClient>(getMongoToken());
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
                const mongoClient = await module.resolve<MongoClient>(getMongoToken('foo'));
                expect(mongoClient).toBeDefined();
            });

            it('should inject the mongo client', async () => {
                const fooProvider = await module.resolve(CustomProvider);
                expect(fooProvider.mongoClient).toBeDefined();
            });
        });

        describe('observability', () => {
            let module: TestingModule;

            beforeAll(async () => {
                module = await Test.createTestingModule({
                    providers: [DefaultProvider],
                    imports: [
                        MongoModule.forRootAsync({
                            useFactory: async () => ({
                                uri: mongodb.getUri(),
                                observable: true,
                            }),
                        }),
                        OpenTelemetryModule.forRoot(),
                    ],
                }).compile();
            });

            afterAll(async () => {
                await module.close();
            });

            it('should register duration', async () => {
                const mongoClient = await module.resolve<MongoClient>(getMongoToken());
                await mongoClient.db().collection('foos').countDocuments();

                const metric = await currentMetric();

                expect(metric.descriptor.name).toBe('db.client.operation.duration');
                expect(metric.dataPoints).toContainEqual(
                    expect.objectContaining({
                        attributes: expect.objectContaining({ 'db.system.name': 'mongodb' }),
                    }),
                );
            });
        });
    });
});
