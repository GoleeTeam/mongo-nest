import { MetricService } from '@golee/nestjs-otel';
import { Logger } from '@nestjs/common';
import { Attributes, Histogram, ValueType } from '@opentelemetry/api';
import { CommandFailedEvent, CommandSucceededEvent, MongoClient, MongoClientOptions } from 'mongodb';

export class Observability {
    private logger = new Logger(Observability.name);
    private readonly operationDuration?: Histogram<Attributes>;
    private enabled: boolean = false;

    constructor(private metricService?: MetricService) {
        if (this.metricService === undefined) {
            this.logger.warn('Missing metric service');
            return;
        }

        this.operationDuration = this.metricService.getHistogram('db.client.operation.duration', {
            description: 'Duration of database client operations.',
            unit: 's',
            valueType: ValueType.DOUBLE,
            advice: {
                explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10],
            },
        });
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
                    'error.type': event.failure.name,
                });
            });
    }

    private toSeconds(milliseconds: number): number {
        return milliseconds / 1000;
    }

    private describe(event: CommandSucceededEvent | CommandFailedEvent) {
        return {
            'db.system': 'mongodb',
            'server.address': event.address,
            'db.operation.name': event.commandName,
        };
    }
}
