import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Loader2, Phone, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { validatePhone } from '@/lib/utils';

const TERMOS_DE_USO = (
  <>
    <p className="mb-3">
      Ao utilizar esta plataforma, você declara estar ciente e de acordo com o seguinte:
    </p>
    <p className="mb-3">
      <strong>1. Armazenamento de dados.</strong> Os dados cadastrais e de uso serão armazenados
      em nosso banco de dados de forma criptografada, em conformidade com as práticas de segurança
      adotadas pela aplicação.
    </p>
    <p className="mb-3">
      <strong>2. Responsabilidade pelos disparos.</strong> Todo e qualquer disparo de mensagens
      realizado através desta ferramenta é de única e exclusiva responsabilidade do usuário que o
      realiza. A plataforma atua apenas como meio técnico; o conteúdo, o destinatário e o uso
      adequado são de total responsabilidade do usuário responsável pelo disparo.
    </p>
    <p className="text-sm text-muted-foreground">
      Ao marcar &quot;Aceitar termos de uso&quot;, você confirma que leu, compreendeu e aceita
      estes termos.
    </p>
  </>
);

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (action: 'login' | 'signup') => {
    if (!email.trim() || !password.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha email e senha.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Senha muito curta",
        description: "A senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    let phoneNormalized: string | undefined;
    if (action === 'signup') {
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.valid) {
        toast({
          title: "Telefone inválido",
          description: phoneValidation.error,
          variant: "destructive",
        });
        return;
      }
      if (!acceptTerms) {
        toast({
          title: "Termos de uso",
          description: "É necessário aceitar os termos de uso para criar a conta.",
          variant: "destructive",
        });
        return;
      }
      phoneNormalized = phoneValidation.normalized;
    }

    setIsLoading(true);

    try {
      if (action === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast({
              title: "Credenciais inválidas",
              description: "Email ou senha incorretos.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Erro ao entrar",
              description: error.message,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Bem-vindo!",
            description: "Login realizado com sucesso.",
          });
        }
      } else {
        const { error } = await signUp(email, password, {
          phone: phoneNormalized!,
          termsAcceptedAt: new Date().toISOString(),
        });
        if (error) {
          if (error.message.includes('User already registered')) {
            toast({
              title: "Email já cadastrado",
              description: "Tente fazer login com este email.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Erro ao cadastrar",
              description: error.message,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Conta criada!",
            description: "Você já pode utilizar o sistema.",
          });
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src="/blitzar-logo.png" alt="Blitzar Labs" className="h-14 object-contain" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Blitzar Labs - Disparador</h1>
            <p className="text-sm text-muted-foreground">Disparos B2B com IA Anti-Bloqueio</p>
          </div>
        </div>

        <Card className="glass-card">
          <CardHeader className="text-center">
            <CardTitle>Acesse sua conta</CardTitle>
            <CardDescription>Entre ou crie uma conta para continuar</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      className="pl-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmit('login')}
                    />
                  </div>
                </div>
                <Button 
                  className="w-full gradient-primary shadow-glow"
                  onClick={() => handleSubmit('login')}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Entrar
                </Button>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-phone">Telefone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-phone"
                      type="tel"
                      placeholder="(11) 99999-9999 ou 11 999999999"
                      className="pl-10"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Informe DDD + número. Será usado para contato e validação da conta.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      className="pl-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmit('signup')}
                    />
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="signup-terms"
                    checked={acceptTerms}
                    onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                    disabled={isLoading}
                  />
                  <label
                    htmlFor="signup-terms"
                    className="text-sm leading-tight cursor-pointer peer-disabled:cursor-not-allowed"
                  >
                    Li e aceito os{' '}
                    <button
                      type="button"
                      className="text-primary underline underline-offset-2 hover:no-underline"
                      onClick={() => setTermsDialogOpen(true)}
                    >
                      Termos de Uso
                    </button>
                  </label>
                </div>
                <Button 
                  className="w-full gradient-primary shadow-glow"
                  onClick={() => handleSubmit('signup')}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Criar conta
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={termsDialogOpen} onOpenChange={setTermsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Termos de Uso
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-foreground pr-2">{TERMOS_DE_USO}</div>
          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={() => {
              setAcceptTerms(true);
              setTermsDialogOpen(false);
            }}
          >
            Li e aceito os termos
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
