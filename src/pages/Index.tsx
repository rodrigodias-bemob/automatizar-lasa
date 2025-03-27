
import { ConfigForm } from "@/components/ConfigForm";
import { TransferHistory } from "@/components/TransferHistory";
import { SlackNotifier } from "@/components/SlackNotifier";
import { useState, useRef } from "react";

const Index = () => {
  const [slackWebhookUrl, setSlackWebhookUrl] = useState<string>("");
  const transferHistoryRef = useRef<any>(null);

  const handleSendNotification = async (webhookUrl: string, message: string) => {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: message }),
        mode: "no-cors", // Para evitar problemas de CORS
      });
      
      setSlackWebhookUrl(webhookUrl);
      return true;
    } catch (error) {
      console.error("Erro ao enviar notificação:", error);
      throw error;
    }
  };

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

        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-8">
            <ConfigForm />
            <SlackNotifier onSendNotification={handleSendNotification} />
          </div>
          <TransferHistory ref={transferHistoryRef} />
        </div>
      </div>
    </div>
  );
};

export default Index;
