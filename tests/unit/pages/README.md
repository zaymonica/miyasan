# Testes Unitários das Páginas

Este diretório contém os testes unitários para as páginas do frontend da aplicação.

## Arquivos de Teste

### ai.test.js
Testes para a página de Configuração de IA (AI Configuration).

**Cobertura:**
- ✅ Carregamento de configuração da API
- ✅ Salvamento de configuração
- ✅ Validação de campos obrigatórios
- ✅ Validação de ranges (temperatura, max tokens)
- ✅ Conversão de valores booleanos
- ✅ Teste de funcionalidade de IA
- ✅ Suporte a modelos (GPT-3.5, GPT-4, GPT-4 Turbo)
- ✅ Valores padrão de configuração

**Total de testes:** 19 testes

### invoices.test.js
Testes para a página de Faturas e Orçamentos (Invoices & Quotes).

**Cobertura:**
- ✅ Carregamento de faturas via API
- ✅ Aplicação de filtros (tipo, status, busca)
- ✅ Estrutura de dados de faturas
- ✅ Gerenciamento de itens de fatura
- ✅ Cálculos (subtotal, impostos, descontos, total)
- ✅ Criação de faturas
- ✅ Visualização de detalhes
- ✅ Envio via WhatsApp
- ✅ Conversão de orçamento para fatura
- ✅ Formatação de moedas (USD, BRL, EUR, GBP)
- ✅ Métodos de pagamento
- ✅ Filtros e busca

**Total de testes:** 43 testes

### widget.test.js
Testes para a página de Widget de Chat WhatsApp.

**Cobertura:**
- ✅ Carregamento de widgets via API
- ✅ Aplicação de filtros de busca
- ✅ Estrutura de dados de widgets
- ✅ Validação de número WhatsApp
- ✅ Validação de cores
- ✅ Criação de widgets
- ✅ Atualização de widgets
- ✅ Exclusão de widgets
- ✅ Geração de código de incorporação
- ✅ Analytics de widgets
- ✅ Acesso público por token
- ✅ Rastreamento de eventos
- ✅ Validação de configurações (margens, raio, tamanho)
- ✅ Gerenciamento de status

**Total de testes:** 26 testes

## Executar os Testes

### Executar todos os testes de páginas
```bash
npm test -- tests/unit/pages
```

### Executar teste específico
```bash
# Teste de IA
npm test -- tests/unit/pages/ai.test.js

# Teste de Invoices
npm test -- tests/unit/pages/invoices.test.js
```

### Executar com cobertura
```bash
npx jest tests/unit/pages --coverage
```

### Executar em modo watch
```bash
npx jest tests/unit/pages --watch
```

## Estrutura dos Testes

Os testes seguem o padrão AAA (Arrange, Act, Assert):

```javascript
describe('Feature', () => {
  beforeEach(() => {
    // Arrange: Setup inicial
  });

  it('should do something', async () => {
    // Arrange: Preparar dados
    const mockData = { ... };
    
    // Act: Executar ação
    const result = await someFunction(mockData);
    
    // Assert: Verificar resultado
    expect(result).toBe(expected);
  });
});
```

## Mocks Utilizados

### Global Mocks
- `fetch`: Mock de requisições HTTP
- `localStorage`: Mock de armazenamento local
- `console`: Mock de logs (quando necessário)

### Dados de Teste
Os testes utilizam dados fictícios que representam cenários reais:
- Configurações de IA com diferentes modelos
- Faturas com diferentes status e tipos
- Clientes com informações completas
- Itens de fatura com cálculos

## Boas Práticas

1. **Isolamento**: Cada teste é independente e não afeta outros
2. **Clareza**: Nomes descritivos que explicam o que está sendo testado
3. **Cobertura**: Testa casos de sucesso, erro e edge cases
4. **Mocks**: Usa mocks para isolar a lógica testada
5. **Asserts**: Verifica comportamentos específicos e esperados

## Resultados

```
Test Suites: 2 passed, 2 total
Tests:       62 passed, 62 total
Snapshots:   0 total
Time:        ~10s
```

## Próximos Passos

Para adicionar novos testes de páginas:

1. Criar arquivo `[nome-da-pagina].test.js` neste diretório
2. Seguir a estrutura dos testes existentes
3. Adicionar documentação neste README
4. Executar os testes para garantir que passam
5. Verificar cobertura de código

## Contribuindo

Ao adicionar novos testes:
- Mantenha a consistência com os testes existentes
- Documente casos de teste complexos
- Teste tanto casos de sucesso quanto de erro
- Mantenha os testes rápidos e focados
