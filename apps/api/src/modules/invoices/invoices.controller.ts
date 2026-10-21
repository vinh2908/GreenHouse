import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  // Dùng @Res() để trả PDF binary trực tiếp (bỏ qua TransformInterceptor —
  // Nest tự nhận diện handler đã tự quản response khi có @Res()).
  @Get(':jobId/invoice.pdf')
  @ApiOperation({ summary: 'Tải hóa đơn điện tử (PDF) của job đã thanh toán' })
  async downloadInvoice(
    @CurrentUser() user: { sub: string; roles?: string[] },
    @Param('jobId') jobId: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.invoicesService.generateInvoicePdf(
      jobId,
      user.sub,
      user.roles ?? [],
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  }
}
