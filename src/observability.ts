import { MetricService } from '@golee/nestjs-otel';
import { Logger } from '@nestjs/common';
import { Attributes, Histogram, ValueType } from '@opentelemetry/api';
import {
    ATTR_DB_OPERATION_NAME,
    ATTR_DB_SYSTEM,
    ATTR_ERROR_TYPE,
    ATTR_SERVER_ADDRESS,
    METRIC_DB_CLIENT_OPERATION_DURATION,
} from '@opentelemetry/semantic-conventions/incubating';
import { CommandFailedEvent, CommandSucceededEvent, MongoClient, MongoClientOptions } from 'mongodb';

const DB_SYSTEM_VALUE_MONGODB = 'mongodb' as const;

export class Observability {
    private logger = new Logger(Observability.name);
    private readonly operationDuration?: Histogram<Attributes>;
    private enabled: boolean = false;

    constructor(private metricService?: MetricService) {
        if (this.metricService === undefined) {
            this.logger.warn('Missing metric service');
            return;
        }

        // see:
        // - reference: https://github.com/open-telemetry/semantic-conventions/blob/v1.26.0/docs/database/database-metrics.md#metric-dbclientoperationduration
        // - sample: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/packages/instrumentation-pg/src/instrumentation.ts
        this.operationDuration = this.metricService.getHistogram(
            METRIC_DB_CLIENT_OPERATION_DURATION, //'db.client.operation.duration',
            {
                description: 'Duration of database client operations.',
                unit: 's',
                valueType: ValueType.DOUBLE,
                advice: {
                    explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
                },
            },
        );
    }

    public enableOn(mongoOptions: MongoClientOptions) {
        this.logger.log('Enabling observability');

        mongoOptions.monitorCommands = true;
        this.enabled = true;
    }

    public on(client: MongoClient) {
        if (!this.enabled || this.operationDuration === undefined) {
            return;
        }

        client
            .on('commandSucceeded', (event: CommandSucceededEvent) => {
                this.operationDuration!.record(this.toSeconds(event.duration), this.describe(event));
            })
            .on('commandFailed', (event: CommandFailedEvent) => {
                this.operationDuration!.record(this.toSeconds(event.duration), {
                    ...this.describe(event),
                    [ATTR_ERROR_TYPE]: event.failure.name,
                });
            });
    }

    private toSeconds(milliseconds: number): number {
        return milliseconds / 1000;
    }

    private describe(event: CommandSucceededEvent | CommandFailedEvent) {
        return {
            [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_MONGODB,
            [ATTR_SERVER_ADDRESS]: event.address,
            [ATTR_DB_OPERATION_NAME]: event.commandName,
        };
    }
}
