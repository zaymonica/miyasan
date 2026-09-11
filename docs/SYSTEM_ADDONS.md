# Sistema de Add-ons

Este documento descreve como criar e gerenciar add-ons do sistema.

## Estrutura de um Add-on

Um add-on deve ser um arquivo ZIP contendo a seguinte estrutura:

```
meu-addon/
├── addon.json          # Obrigatório - Metadados do add-on
├── icon.png            # Opcional - Ícone do add-on (png, jpg, svg)
├── hooks/              # Opcional - Hooks de ciclo de vida
│   ├── activate.js     # Executado ao ativar
│   ├── deactivate.js   # Executado ao desativar
│   └── uninstall.js    # Executado ao deletar
├── routes/             # Opcional - Rotas da API
│   └── index.js
├── controllers/        # Opcional - Controllers
├── services/           # Opcional - Serviços
└── migrations/         # Opcional - Migrações de banco
```

## addon.json

O arquivo `addon.json` é obrigatório e deve conter:

```json
{
  "slug": "meu-addon",
  "name": "Meu Add-on",
  "description": "Descrição do add-on",
  "version": "1.0.0",
  "author": "Seu Nome",
  "icon": "puzzle-piece",
  "config": {
    "settings": {}
  }
}
```

### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| slug | string | Sim | Identificador único (apenas letras minúsculas, números e hífens) |
| name | string | Sim | Nome de exibição do add-on |
| description | string | Não | Descrição do add-on |
| version | string | Não | Versão (padrão: 1.0.0) |
| author | string | Não | Autor do add-on |
| icon | string | Não | Nome do ícone FontAwesome (padrão: puzzle-piece) |
| config | object | Não | Configurações personalizadas |

## Hooks de Ciclo de Vida

### activate.js

Executado quando o add-on é ativado:

```javascript
module.exports = async function activate() {
  // Criar tabelas no banco
  // Registrar rotas
  // Inicializar serviços
};
```

### deactivate.js

Executado quando o add-on é desativado:

```javascript
module.exports = async function deactivate() {
  // Desregistrar rotas
  // Parar serviços
};
```

### uninstall.js

Executado quando o add-on é deletado:

```javascript
module.exports = async function uninstall() {
  // Remover tabelas do banco
  // Limpar arquivos
};
```

## API Endpoints

### Listar Add-ons
```
GET /api/superadmin/system-addons
```

### Obter Add-on
```
GET /api/superadmin/system-addons/:id
```

### Upload de Add-on
```
POST /api/superadmin/system-addons/upload
Content-Type: multipart/form-data

addon: [arquivo.zip]
```

### Ativar/Desativar Add-on
```
PUT /api/superadmin/system-addons/:id/toggle
```

### Obter Ícone
```
GET /api/superadmin/system-addons/:id/icon
```

### Deletar Add-on
```
DELETE /api/superadmin/system-addons/:id
```

## Exemplo de Criação

1. Crie a estrutura de pastas do add-on
2. Crie o arquivo `addon.json` com os metadados
3. Adicione hooks se necessário
4. Compacte tudo em um arquivo ZIP
5. Faça upload pelo painel do SuperAdmin

## Banco de Dados

A tabela `system_addons` armazena os add-ons instalados:

```sql
CREATE TABLE system_addons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50),
    author VARCHAR(255),
    icon VARCHAR(255),
    directory VARCHAR(255) NOT NULL,
    config JSON,
    active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

Execute a migration em `migrations/create_system_addons_table.sql` para criar a tabela.
