import { Module } from '@nestjs/common'
import { WorkspaceModule } from '../workspace/workspace.module'
import { BroadcastService } from './broadcast.service'

@Module({
  imports: [WorkspaceModule],
  providers: [BroadcastService],
  exports: [BroadcastService],
})
export class BroadcastModule {}
