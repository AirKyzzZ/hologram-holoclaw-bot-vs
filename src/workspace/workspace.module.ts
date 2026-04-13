import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { McpModule } from '../mcp/mcp.module'
import { InviteService } from './invite.service'
import { WorkspaceEntity } from './workspace.entity'
import { WorkspaceInviteEntity } from './workspace-invite.entity'
import { WorkspaceMemberEntity } from './workspace-member.entity'
import { WorkspaceMcpServerEntity } from './workspace-mcp-server.entity'
import { WorkspaceMcpService } from './workspace-mcp.service'
import { WorkspaceMemberService } from './workspace-member.service'
import { WorkspaceService } from './workspace.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceEntity,
      WorkspaceMemberEntity,
      WorkspaceInviteEntity,
      WorkspaceMcpServerEntity,
    ]),
    forwardRef(() => McpModule),
  ],
  providers: [WorkspaceService, WorkspaceMemberService, InviteService, WorkspaceMcpService],
  exports: [
    WorkspaceService,
    WorkspaceMemberService,
    InviteService,
    WorkspaceMcpService,
    TypeOrmModule,
  ],
})
export class WorkspaceModule {}
