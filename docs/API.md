# CT LK Futevôlei - API Documentation

## Overview

O bot expõe endpoints HTTP para monitoramento e health checks através do servidor de health check.

**Base URL:** `http://localhost:3000` (configurável via `HEALTH_PORT`)

---

## Endpoints

### Health Check

#### `GET /health`

Retorna o status completo de saúde da aplicação.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-12-29T10:00:00.000Z",
  "uptime": 3600,
  "version": "3.0.0",
  "checks": {
    "whatsapp": {
      "status": "up",
      "latency": 5,
      "message": "Conectado ao WhatsApp"
    },
    "sqlite": {
      "status": "up",
      "latency": 1,
      "message": "Banco SQLite operacional"
    },
    "redis": {
      "status": "up",
      "latency": 2,
      "message": "Redis conectado"
    },
    "queue": {
      "status": "up",
      "latency": 1,
      "message": "Filas ativas - Notificações: 0 pendentes"
    }
  }
}
```

**Status Codes:**
- `200` - Aplicação saudável ou degradada
- `503` - Aplicação não saudável

**Status Values:**
- `healthy` - Todos os componentes funcionando
- `degraded` - Componentes não-críticos com problemas
- `unhealthy` - Componentes críticos com problemas

---

#### `GET /ready`

Verifica se a aplicação está pronta para receber tráfego (Kubernetes readiness probe).

**Response:**

```json
{
  "ready": true
}
```

ou

```json
{
  "ready": false,
  "whatsapp": false,
  "sqlite": true
}
```

**Status Codes:**
- `200` - Pronto
- `503` - Não pronto

---

#### `GET /live`

Verifica se a aplicação está viva (Kubernetes liveness probe).

**Response:**

```json
{
  "alive": true,
  "uptime": 3600
}
```

**Status Codes:**
- `200` - Sempre (se o servidor responder)

---

### Métricas

#### `GET /metrics`

Retorna métricas no formato Prometheus.

**Response:**

```
# HELP whatsapp_bot_messages_received_total Total de mensagens recebidas
# TYPE whatsapp_bot_messages_received_total counter
whatsapp_bot_messages_received_total{type="text",is_group="false"} 150

# HELP whatsapp_bot_bookings_created_total Total de agendamentos criados
# TYPE whatsapp_bot_bookings_created_total counter
whatsapp_bot_bookings_created_total{unit="recreio"} 10
whatsapp_bot_bookings_created_total{unit="bangu"} 5

# HELP whatsapp_bot_active_sessions Número de sessões ativas
# TYPE whatsapp_bot_active_sessions gauge
whatsapp_bot_active_sessions 25

# HELP whatsapp_bot_message_latency_seconds Latência do processamento de mensagens
# TYPE whatsapp_bot_message_latency_seconds histogram
whatsapp_bot_message_latency_seconds_bucket{type="text",le="0.1"} 100
whatsapp_bot_message_latency_seconds_sum{type="text"} 15.5
whatsapp_bot_message_latency_seconds_count{type="text"} 150
```

**Content-Type:** `text/plain; version=0.0.4; charset=utf-8`

---

## Métricas Disponíveis

### Contadores

| Nome | Labels | Descrição |
|------|--------|-----------|
| `whatsapp_bot_messages_received_total` | `type`, `is_group` | Total de mensagens recebidas |
| `whatsapp_bot_messages_processed_total` | `type`, `command` | Total de mensagens processadas |
| `whatsapp_bot_message_errors_total` | `error_type` | Total de erros |
| `whatsapp_bot_bookings_created_total` | `unit` | Total de agendamentos |
| `whatsapp_bot_notifications_sent_total` | `type`, `status` | Total de notificações |
| `whatsapp_bot_rate_limit_hits_total` | - | Vezes que rate limit foi atingido |

### Gauges

| Nome | Labels | Descrição |
|------|--------|-----------|
| `whatsapp_bot_active_sessions` | - | Sessões ativas |
| `whatsapp_bot_paused_chats` | - | Chats pausados |
| `whatsapp_bot_queue_size` | `queue` | Tamanho da fila |
| `whatsapp_bot_memory_usage_bytes` | `type` | Uso de memória |

### Histogramas

| Nome | Labels | Descrição |
|------|--------|-----------|
| `whatsapp_bot_message_latency_seconds` | `type` | Latência de processamento |
| `whatsapp_bot_booking_latency_seconds` | `unit` | Latência de agendamentos |
| `whatsapp_bot_notification_latency_seconds` | `type` | Latência de notificações |

---

## Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `HEALTH_PORT` | Porta do servidor HTTP | `3000` |
| `REDIS_URL` | URL de conexão Redis | `redis://localhost:6379` |
| `NODE_ENV` | Ambiente (development/production) | `development` |

---

## Exemplos de Uso

### curl

```bash
# Health check
curl http://localhost:3000/health

# Readiness
curl http://localhost:3000/ready

# Liveness
curl http://localhost:3000/live

# Métricas Prometheus
curl http://localhost:3000/metrics
```

### Docker Compose

O docker-compose.yml já está configurado com health checks:

```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

### Kubernetes

```yaml
livenessProbe:
  httpGet:
    path: /live
    port: 3000
  initialDelaySeconds: 60
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
```
