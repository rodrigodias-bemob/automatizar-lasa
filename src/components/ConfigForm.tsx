
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const ConfigForm = () => {
  const [s3Config, setS3Config] = useState({
    accessKey: "",
    secretKey: "",
    bucket: "",
    region: "",
  });

  const [sftpConfig, setSftpConfig] = useState({
    host: "",
    port: "",
    username: "",
    password: "",
    directory: "",
  });

  const handleS3Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    setS3Config({ ...s3Config, [e.target.name]: e.target.value });
  };

  const handleSftpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSftpConfig({ ...sftpConfig, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Aqui você implementaria a lógica para salvar as configurações
    toast.success("Configurações salvas com sucesso!");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-fade-up">
      <Card>
        <CardHeader>
          <CardTitle>Configuração Amazon S3</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="accessKey">Access Key</Label>
            <Input
              id="accessKey"
              name="accessKey"
              value={s3Config.accessKey}
              onChange={handleS3Change}
              placeholder="Digite sua Access Key do S3"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="secretKey">Secret Key</Label>
            <Input
              id="secretKey"
              name="secretKey"
              type="password"
              value={s3Config.secretKey}
              onChange={handleS3Change}
              placeholder="Digite sua Secret Key do S3"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bucket">Bucket</Label>
            <Input
              id="bucket"
              name="bucket"
              value={s3Config.bucket}
              onChange={handleS3Change}
              placeholder="Nome do bucket"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="region">Região</Label>
            <Input
              id="region"
              name="region"
              value={s3Config.region}
              onChange={handleS3Change}
              placeholder="ex: us-east-1"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuração SFTP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="host">Host</Label>
            <Input
              id="host"
              name="host"
              value={sftpConfig.host}
              onChange={handleSftpChange}
              placeholder="Endereço do servidor SFTP"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Porta</Label>
            <Input
              id="port"
              name="port"
              value={sftpConfig.port}
              onChange={handleSftpChange}
              placeholder="ex: 22"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Usuário</Label>
            <Input
              id="username"
              name="username"
              value={sftpConfig.username}
              onChange={handleSftpChange}
              placeholder="Nome de usuário SFTP"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={sftpConfig.password}
              onChange={handleSftpChange}
              placeholder="Senha SFTP"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="directory">Diretório</Label>
            <Input
              id="directory"
              name="directory"
              value={sftpConfig.directory}
              onChange={handleSftpChange}
              placeholder="Caminho do diretório no SFTP"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg">
          Salvar Configurações
        </Button>
      </div>
    </form>
  );
};
