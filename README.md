# Mongo Nest

## Description

This simple library allows you to use mongodb without carrying around the infamous mongoose ✨.

### Installation

```bash
npm install @golee/mongo-nest

pnpm add @golee/mongo-nest
```

### Usage

```typescript
// app.module.ts

@Module({
    imports: [MongoModule.forRoot({uri: 'mongodb://localhost:27017'})],
    controllers: [],
    providers: [],
})
export class AppModule implements NestModule {
}

// app.service.ts
@Injectable()
export class AppService {
    constructor(@InjectMongo() public readonly mongoClient: MongoClient) {
    }
}

```