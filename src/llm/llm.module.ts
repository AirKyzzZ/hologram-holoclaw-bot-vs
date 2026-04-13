import { Module } from '@nestjs/common'
import { RagModule } from 'src/rag/rag.module'
import { MemoryModule } from 'src/memory/memory.module'
import { McpModule } from 'src/mcp/mcp.module'
import { BroadcastModule } from 'src/broadcast/broadcast.module'
import { LlmService } from './llm.service'

@Module({
  imports: [RagModule, MemoryModule, McpModule, BroadcastModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
