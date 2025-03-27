
import { ConfigForm } from "@/components/ConfigForm";
import { TransferHistory } from "@/components/TransferHistory";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            S3 para SFTP Bridge
          </h1>
          <p className="text-muted-foreground">
            Transferência automática de arquivos do Amazon S3 para SFTP
          </p>
        </div>

        <div className="grid gap-8">
          <ConfigForm />
          <TransferHistory />
        </div>
      </div>
    </div>
  );
};

export default Index;
