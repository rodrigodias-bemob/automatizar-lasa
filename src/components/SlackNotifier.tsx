
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MessageSquare, Bell } from "lucide-react";

interface SlackNotifierProps {
  onSendNotification: (webhookUrl: string, message: string) => Promise<void>;
}

export const SlackNotifier = ({ onSendNotification }: SlackNotifierProps) => {
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [isSending, setIsSending] = useState(false);

  const handleTestNotification = async () => {
    if (!webhookUrl) {
      toast.error("Por favor, insira a URL do webhook do Slack");
      return;
    }

    setIsSending(true);
    try {
      await onSendNotification(
        webhookUrl,
        "Teste de notificação: Verificação de arquivos S3 para SFTP"
      );
      toast.success("Notificação de teste enviada com sucesso!");
    } catch (error) {
      toast.error("Erro ao enviar notificação de teste");
      console.error("Erro ao enviar notificação:", error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notificações no Slack
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">
            URL do Webhook do Slack
          </label>
          <Input
            type="text"
            placeholder="https://hooks.slack.com/services/..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <p className="text-sm text-muted-foreground mt-1">
            Insira a URL do webhook do Slack para receber notificações quando
            arquivos estiverem faltando
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={handleTestNotification}
            disabled={isSending || !webhookUrl}
            className="gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            Enviar notificação de teste
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
