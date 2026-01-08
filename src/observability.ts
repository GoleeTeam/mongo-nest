import { MetricService } from '@golee/nestjs-otel';
import { Logger } from '@nestjs/common';
import { Attributes, Histogram, ValueType } from '@opentelemetry/api';
import { CommandFailedEvent, CommandSucceededEvent, MongoClient } from 'mongodb';

export class Observability {
    private logger = new Logger(Observability.name);
    private readonly operationDuration?: Histogram<Attributes>;

    constructor(private metricService?: MetricService) {
        if (this.metricService === undefined) {
            this.logger.warn('Missing metric service');
            return;
        }

        this.operationDuration = this.metricService.getHistogram('db.client.operation.duration', {
            description: 'Duration of database client operations.',
            unit: 's',
            valueType: ValueType.DOUBLE,
        });
    }

    public on(client: MongoClient) {
        if (this.operationDuration === undefined) {
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

    // inspired by PostgreSQL OTEL instrumentation, at:
    // https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/packages/instrumentation-pg/src/instrumentation.ts#L313
    private toSeconds(duration: number): number {
        return duration / 1000;
    }

    private describe(event: CommandSucceededEvent | CommandFailedEvent) {
        return {
            'db.system': 'mongodb',
            'server.address': event.address,
            'db.operation.name': event.commandName,
        };
    }
}
