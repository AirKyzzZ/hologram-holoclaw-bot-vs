import { Global, Module } from '@nestjs/common'
import { SessionEntity } from './models'
import { CoreService } from './core.service'
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm'
import { ConnectionEntity, EventsModule } from '@2060.io/vs-agent-nestjs-client'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ChatbotModule } from 'src/chatbot/chatbot.module'
import { MemoryModule } from 'src/memory/memory.module'
import { SttModule } from 'src/stt/stt.module'
import { AgentContentService } from './agent-content.service'
import { McpConfigEntity } from '../mcp/mcp-config.entity'
import { ApprovalRequestEntity } from '../rbac/approval-request.entity'
import { WorkspaceEntity } from '../workspace/workspace.entity'
import { WorkspaceMemberEntity } from '../workspace/workspace-member.entity'
import { WorkspaceInviteEntity } from '../workspace/workspace-invite.entity'
import { WorkspaceMcpServerEntity } from '../workspace/workspace-mcp-server.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { BroadcastModule } from '../broadcast/broadcast.module'

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ConnectionEntity, SessionEntity]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        host: configService.get<string>('appConfig.postgresHost'),
        port: 5432,
        username: configService.get<string>('appConfig.postgresUser'),
        password: configService.get<string>('appConfig.postgresPassword'),
        database: configService.get<string>('appConfig.postgresDbName'),
        entities: [
          ConnectionEntity,
          SessionEntity,
          McpConfigEntity,
          ApprovalRequestEntity,
          WorkspaceEntity,
          WorkspaceMemberEntity,
          WorkspaceInviteEntity,
          WorkspaceMcpServerEntity,
        ],
        synchronize: true,
        ssl: false,
        logging: false,
        retryAttempts: 10,
        retryDelay: 2000,
      }),
      inject: [ConfigService],
    }),
    ChatbotModule,
    MemoryModule,
    WorkspaceModule,
    BroadcastModule,
    SttModule,
    EventsModule,
  ],
  controllers: [],
  providers: [CoreService, AgentContentService],
  exports: [TypeOrmModule, CoreService, AgentContentService],
})
export class CoreModule {}
