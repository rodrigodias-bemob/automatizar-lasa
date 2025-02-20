
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Clock } from "lucide-react";

type Transfer = {
  id: string;
  filename: string;
  status: "success" | "error" | "pending";
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
];

const StatusIcon = ({ status }: { status: Transfer["status"] }) => {
  switch (status) {
    case "success":
      return <CheckCircle className="w-5 h-5 text-success" />;
    case "error":
      return <XCircle className="w-5 h-5 text-error" />;
    case "pending":
      return <Clock className="w-5 h-5 text-muted-foreground animate-pulse" />;
  }
};

export const TransferHistory = () => {
  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle>Histórico de Transferências</CardTitle>
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
                    <p className="text-sm text-error">{transfer.message}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
