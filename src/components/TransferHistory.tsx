
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Transfer = {
  id: string;
  filename: string;
  status: "success" | "error" | "pending" | "missing";
  timestamp: string;
  message?: string;
};

const mockTransfers: Transfer[] = [
  {
    id: "1",
    filename: "data-2024-02-20.csv",
    status: "success",
    timestamp: "2024-02-20 10:30:00",
  },
  {
    id: "2",
    filename: "data-2024-02-19.csv",
    status: "error",
    timestamp: "2024-02-19 10:30:00",
    message: "Falha na conexão SFTP",
  },
  {
    id: "3",
    filename: "data-2024-02-18.csv",
    status: "pending",
    timestamp: "2024-02-18 10:30:00",
  },
  {
    id: "4",
    filename: "data-2024-02-17.csv",
    status: "missing",
    timestamp: "2024-02-17 10:30:00",
    message: "Arquivo não encontrado no S3",
  },
];

const StatusIcon = ({ status }: { status: Transfer["status"] }) => {
  switch (status) {
    case "success":
      return <CheckCircle className="w-5 h-5 text-success" />;
    case "error":
      return <XCircle className="w-5 h-5 text-error" />;
    case "pending":
      return <Clock className="w-5 h-5 text-muted-foreground animate-pulse" />;
    case "missing":
      return <AlertTriangle className="w-5 h-5 text-warning" />;
  }
};

const sendSlackNotification = async (webhookUrl: string, message: string) => {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: message }),
    mode: "no-cors", // Para evitar problemas de CORS
  });
  
  // Como estamos usando no-cors, não temos acesso ao status da resposta
  // Apenas assumimos que a notificação foi enviada
  return true;
};

export const TransferHistory = () => {
  const [isChecking, setIsChecking] = useState(false);

  const checkMissingFile = async (webhookUrl?: string) => {
    setIsChecking(true);
    
    try {
      // Simulando a verificação do arquivo do dia
      // Em um ambiente real, isso seria uma chamada para verificar no S3
      const today = new Date();
      const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const expectedFilename = `data-${formattedDate}.csv`;
      
      // Simulando que o arquivo do dia não existe (50% de chance)
      const fileExists = Math.random() > 0.5;
      
      if (!fileExists) {
        toast.warning(`Arquivo do dia (${expectedFilename}) não encontrado no S3`);
        
        // Se temos uma URL de webhook, enviar notificação ao Slack
        if (webhookUrl) {
          await sendSlackNotification(
            webhookUrl,
            `⚠️ ALERTA: Arquivo ${expectedFilename} não encontrado no S3. Por favor, verifique.`
          );
          toast.success("Notificação enviada ao Slack");
        }
        
        return false;
      } else {
        toast.success(`Arquivo do dia (${expectedFilename}) encontrado no S3`);
        return true;
      }
    } catch (error) {
      console.error("Erro ao verificar arquivo:", error);
      toast.error("Erro ao verificar arquivo do dia");
      return false;
    } finally {
      setIsChecking(false);
    }
  };
  
  return (
    <Card className="animate-fade-up">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Histórico de Transferências</CardTitle>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => checkMissingFile()}
          disabled={isChecking}
        >
          {isChecking ? (
            <>
              <Clock className="w-4 h-4 mr-2 animate-spin" />
              Verificando...
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 mr-2" />
              Verificar arquivo do dia
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {mockTransfers.map((transfer) => (
            <div
              key={transfer.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card"
            >
              <div className="flex items-center space-x-4">
                <StatusIcon status={transfer.status} />
                <div>
                  <p className="font-medium">{transfer.filename}</p>
                  <p className="text-sm text-muted-foreground">
                    {transfer.timestamp}
                  </p>
                  {transfer.message && (
                    <p className={`text-sm ${transfer.status === "missing" ? "text-warning" : "text-error"}`}>
                      {transfer.message}
                    </p>
                  )}
                </div>
              </div>
              
              {transfer.status === "missing" && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    toast.info(`Notificação para ${transfer.filename} enviada manualmente`);
                  }}
                >
                  Notificar
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
