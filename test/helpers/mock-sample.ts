/** The stub set most mock tests share: accounts, bodies, examples, files, streams and two OAuth2 servers. */
export const sampleFiles: Record<string, string> = {
  'accounts.json': `[
  {
    "name": "listAccounts 200 first page",
    "operation": "listAccounts",
    "description": "The spec's firstPage example: no query parameters at all.",
    "request": {
      "method": "GET",
      "path": "/v1/accounts",
      "query": {
        "limit": null,
        "offset": {
          "absent": true
        }
      },
      "headers": {
        "Accept": {
          "startsWith": "application/json"
        }
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          },
          {
            "apiKeyHeader": {
              "in": "header",
              "name": "X-API-Key",
              "value": "test-api-key"
            },
            "basicAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ="
            }
          }
        ]
      }
    },
    "response": {
      "status": 200,
      "headers": {
        "Content-Type": "application/json",
        "X-Request-Id": "req_list_accounts_p1"
      },
      "body": {
        "json": {
          "data": [
            {
              "id": "7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d",
              "name": "Operating cash",
              "class": "asset",
              "status": "active"
            }
          ],
          "has_more": true,
          "total_count": 42
        }
      }
    }
  },
  {
    "name": "listAccounts 200 page 2",
    "operation": "listAccounts",
    "request": {
      "method": "GET",
      "path": "/v1/accounts",
      "query": {
        "offset": "1",
        "tags": [
          "rent",
          "shared"
        ],
        "cursor": {
          "startsWith": "cur_"
        },
        "limit": null
      },
      "headers": {
        "Accept": {
          "startsWith": "application/json"
        }
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          },
          {
            "apiKeyHeader": {
              "in": "header",
              "name": "X-API-Key",
              "value": "test-api-key"
            },
            "basicAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ="
            }
          }
        ]
      }
    },
    "response": {
      "status": 200,
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "json": {
          "data": [],
          "has_more": false,
          "total_count": 42
        }
      }
    }
  },
  {
    "name": "listAccounts 200 filtered",
    "operation": "listAccounts",
    "description": "A deepObject key and a value with a space: both arrive percent-encoded and are decoded before matching.",
    "request": {
      "method": "GET",
      "path": "/v1/accounts",
      "query": {
        "filter[status]": "active",
        "q": "cash flow",
        "limit": null,
        "offset": null
      },
      "headers": {
        "Accept": {
          "startsWith": "application/json"
        }
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      }
    },
    "response": {
      "status": 200,
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "json": {
          "data": [
            {
              "id": "7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d",
              "name": "Operating cash",
              "class": "asset",
              "status": "active"
            }
          ],
          "has_more": false,
          "total_count": 1
        }
      }
    }
  },
  {
    "name": "createAccount 201",
    "operation": "createAccount",
    "request": {
      "method": "POST",
      "path": "/v1/accounts",
      "headers": {
        "Idempotency-Key": "9b2f6c1e-7d3a-4e8b-a5c4-1f0e9d8c7b6a",
        "Content-Type": {
          "startsWith": "application/json"
        },
        "Prefer": {
          "absent": true
        }
      },
      "cookies": {
        "ledger_session": "sess_7f3a"
      },
      "auth": {
        "anyOf": [
          {
            "oauth2ClientCredentials": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer cc-access-token"
            }
          }
        ]
      },
      "body": {
        "json": {
          "name": "Operating cash",
          "class": "asset",
          "owner_id": "c0ffee00-1234-4567-89ab-cdef01234567",
          "credit_limit": "1250.75"
        }
      }
    },
    "response": {
      "status": 201,
      "headers": {
        "Content-Type": "application/json",
        "Location": "{{origin}}/v1/accounts/7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d"
      },
      "body": {
        "json": {
          "id": "7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d",
          "name": "Operating cash",
          "class": "asset",
          "status": "active",
          "sequence": 9007199254740993
        }
      }
    }
  },
  {
    "name": "deleteAccount 204",
    "operation": "deleteAccount",
    "request": {
      "method": "DELETE",
      "path": "/v1/accounts/7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d",
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      },
      "body": null
    },
    "response": {
      "status": 204
    }
  },
  {
    "name": "getAccount 404",
    "operation": "getAccount",
    "kind": "error",
    "description": "Served when the request adds Prefer: code=404.",
    "request": {
      "method": "GET",
      "path": "/v1/accounts/{account_id}",
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      }
    },
    "response": {
      "status": 404,
      "headers": {
        "Content-Type": "application/json",
        "X-Request-Id": "req_err_404"
      },
      "body": {
        "json": {
          "code": "not_found",
          "message": "No resource exists at this identifier.",
          "request_id": "req_err_404"
        }
      }
    }
  }
]
`,
  'bodies.json': `[
  {
    "name": "settleAccount 200",
    "operation": "settleAccount",
    "description": "A form body: every field named, a repeated field as an array, a bracketed key written literally, a date-time matched as an instant, and a field that must not be sent.",
    "request": {
      "method": "POST",
      "path": "/v1/accounts/7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d/settle",
      "headers": {
        "Content-Type": {
          "startsWith": "application/x-www-form-urlencoded"
        }
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      },
      "body": {
        "form": {
          "note": "Month end",
          "tags": [
            "rent",
            "shared"
          ],
          "filter[since]": "2026-02-01",
          "settled_at": {
            "dateTime": "2026-02-28T17:00:00Z"
          },
          "dry_run": null
        }
      }
    },
    "response": {
      "status": 200,
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "json": {
          "id": "7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d",
          "status": "settled",
          "settled_at": "2026-02-28T17:00:00Z"
        }
      }
    }
  },
  {
    "name": "uploadStatements 201 two files",
    "operation": "uploadStatements",
    "description": "A multipart body whose 'files' field carries two files, as a list parameter sends them; the array pairs with the parts in wire order.",
    "request": {
      "method": "POST",
      "path": "/v1/accounts/7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d/statements",
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      },
      "body": {
        "multipart": {
          "parts": {
            "files": [
              {
                "filename": "statement-2026-01.pdf",
                "contentType": "application/pdf",
                "bytes": "JVBERi0xLjcK"
              },
              {
                "filename": "statement-2026-02.pdf",
                "contentType": "application/pdf",
                "bytes": "JVBERi0xLjcK"
              }
            ],
            "note": {
              "text": "January and February"
            }
          }
        }
      }
    },
    "response": {
      "status": 201,
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "json": {
          "uploaded": 2
        }
      }
    }
  },
  {
    "name": "createTransaction 201",
    "operation": "createTransaction",
    "description": "Rules inside a JSON body: a key the SDK generates is matched by its prefix, a date-time as an instant in any spelling (or Unix seconds), and free text is not checked at all. The request-time header is an instant too.",
    "request": {
      "method": "POST",
      "path": "/v1/accounts/7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d/transactions",
      "headers": {
        "Content-Type": {
          "startsWith": "application/json"
        },
        "X-Request-Time": {
          "dateTime": "2026-03-01T09:00:00Z"
        }
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      },
      "body": {
        "json": {
          "amount": "250.00",
          "idempotency_key": {
            "$startsWith": "idem_"
          },
          "posted_at": {
            "$dateTime": "2026-03-01T09:00:00Z"
          },
          "memo": {
            "$any": true
          }
        }
      }
    },
    "response": {
      "status": 201,
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "json": {
          "id": "t3",
          "amount": "250.00",
          "posted_at": "2026-03-01T09:00:00Z",
          "status": "posted"
        }
      }
    }
  }
]`,
  'examples.json': `[
  {
    "name": "listTransactions 200 firstPage",
    "operation": "listTransactions",
    "example": "firstPage",
    "description": "The first of two named response examples of one request. A request that asks for no example gets this one, being first in file order.",
    "request": {
      "method": "GET",
      "path": "/v1/accounts/7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d/transactions",
      "headers": {
        "Accept": {
          "startsWith": "application/json"
        }
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      }
    },
    "response": {
      "status": 200,
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "json": {
          "data": [
            {
              "id": "t1",
              "amount": "250.00"
            },
            {
              "id": "t2",
              "amount": "75.50"
            }
          ],
          "has_more": true
        }
      }
    }
  },
  {
    "name": "listTransactions 200 noItems",
    "operation": "listTransactions",
    "example": "noItems",
    "description": "The second named example of the same request; only 'Prefer: example=noItems' reaches it.",
    "request": {
      "method": "GET",
      "path": "/v1/accounts/7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d/transactions",
      "headers": {
        "Accept": {
          "startsWith": "application/json"
        }
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      }
    },
    "response": {
      "status": 200,
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "json": {
          "data": [],
          "has_more": false
        }
      }
    }
  },
  {
    "name": "listTransactions 404 unknownAccount",
    "operation": "listTransactions",
    "kind": "error",
    "example": "unknownAccount",
    "description": "A named error example: 'Prefer: code=404' reaches it with or without 'example=unknownAccount'.",
    "request": {
      "method": "GET",
      "path": "/v1/accounts/{account_id}/transactions",
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      }
    },
    "response": {
      "status": 404,
      "headers": {
        "Content-Type": "application/problem+json"
      },
      "body": {
        "json": {
          "code": "not_found",
          "message": "No account with that id."
        }
      }
    }
  }
]`,
  'files.json': `[
  {
    "name": "downloadDocumentBundle 200",
    "description": "A multipart response: the document's metadata as a JSON part and its content as a file part, served in this order under the default boundary.",
    "operation": "downloadDocumentBundle",
    "request": {
      "method": "GET",
      "path": "/v1/documents/d0c5e1a2-6b7c-4d8e-9f01-a2b3c4d5e6f7/bundle",
      "headers": {
        "Accept": "multipart/form-data"
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      }
    },
    "response": {
      "status": 200,
      "body": {
        "multipart": {
          "parts": {
            "metadata": {
              "json": {
                "id": "d0c5e1a2-6b7c-4d8e-9f01-a2b3c4d5e6f7",
                "title": "February statement",
                "content_type": "application/pdf"
              }
            },
            "file": {
              "filename": "statement-2026-02.pdf",
              "contentType": "application/pdf",
              "bytes": "JVBERi0xLjcK"
            }
          }
        }
      }
    }
  }
]`,
  'oauth2.json': `[
  {
    "name": "oauth2 authorization server",
    "kind": "oauth2",
    "description": "All four flows at their default tokens: client credentials and the password grant at the token path, the authorization-code and implicit flows sharing one authorize path.",
    "oauth2": {
      "tokenPath": "/oauth2/token",
      "flows": {
        "clientCredentials": {},
        "authorizationCode": {
          "authorizePath": "/oauth2/authorize"
        },
        "password": {},
        "implicit": {
          "authorizePath": "/oauth2/authorize"
        }
      },
      "clientId": "test-client-id",
      "clientSecret": "test-client-secret",
      "scopes": [
        "ledger:read",
        "ledger:write",
        "audit:read"
      ]
    }
  }
]
`,
  'partner-oauth2.json': `[
  {
    "name": "partner oauth2 server",
    "kind": "oauth2",
    "description": "A second authorization server on its own token path, as a spec whose oauth2 schemes name two token URLs needs; it issues its own token to its own client.",
    "oauth2": {
      "tokenPath": "/partner/oauth2/token",
      "flows": {
        "clientCredentials": {
          "accessToken": "partner-access-token"
        }
      },
      "clientId": "partner-client-id",
      "clientSecret": "partner-client-secret",
      "scopes": [
        "partner:read"
      ]
    }
  }
]`,
  'streams.json': String.raw`[
  {
    "name": "streamAccountEvents 200 live",
    "operation": "streamAccountEvents",
    "request": {
      "method": "GET",
      "path": "/v1/accounts/7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d/events",
      "query": {
        "since_sequence": null
      },
      "headers": {
        "Accept": "text/event-stream"
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      }
    },
    "response": {
      "status": 200,
      "headers": {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache"
      },
      "chunkDelayMs": 5,
      "body": {
        "sse": [
          {
            "id": "1",
            "data": {
              "type": "balance.updated",
              "sequence": 9007199254740993
            }
          },
          {
            "id": "2",
            "event": "transaction.posted",
            "retry": 1500,
            "data": {
              "type": "transaction.posted",
              "amount": "250.00"
            }
          },
          {
            "data": "[DONE]"
          }
        ]
      }
    }
  },
  {
    "name": "exportTransactions 200",
    "operation": "exportTransactions",
    "request": {
      "method": "GET",
      "path": "/v1/accounts/7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d/transactions/export",
      "headers": {
        "Accept": "application/x-ndjson"
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      }
    },
    "response": {
      "status": 200,
      "headers": {
        "Content-Type": "application/x-ndjson"
      },
      "body": {
        "ndjson": [
          {
            "id": "t1",
            "amount": "250.00"
          },
          {
            "id": "t2",
            "amount": "75.50"
          }
        ]
      }
    }
  },
  {
    "name": "uploadDocument 201",
    "operation": "uploadDocument",
    "request": {
      "method": "POST",
      "path": "/v1/documents",
      "headers": {
        "Content-Type": {
          "startsWith": "multipart/form-data"
        }
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      },
      "body": {
        "multipart": {
          "parts": {
            "file": {
              "filename": "statement-2026-02.pdf",
              "contentType": "application/pdf",
              "bytes": "JVBERi0xLjcK"
            },
            "metadata": {
              "contentType": {
                "startsWith": "application/json"
              },
              "json": {
                "title": "February statement",
                "tags": [
                  "statement",
                  "2026-02"
                ]
              }
            },
            "description": {
              "text": "Monthly statement for February 2026"
            }
          }
        }
      }
    },
    "response": {
      "status": 201,
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "json": {
          "id": "d0c5e1a2-6b7c-4d8e-9f01-a2b3c4d5e6f7",
          "title": "February statement",
          "size_bytes": 9,
          "content_type": "application/pdf"
        }
      }
    }
  },
  {
    "name": "downloadDocumentContent 200",
    "operation": "downloadDocumentContent",
    "request": {
      "method": "GET",
      "path": "/v1/documents/d0c5e1a2-6b7c-4d8e-9f01-a2b3c4d5e6f7/content",
      "headers": {
        "Accept": "application/octet-stream"
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      }
    },
    "response": {
      "status": 200,
      "headers": {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"statement-2026-02.pdf\""
      },
      "body": {
        "bytes": "JVBERi0xLjcK"
      }
    }
  },
  {
    "name": "replaceDocumentContent 200",
    "operation": "replaceDocumentContent",
    "request": {
      "method": "PUT",
      "path": "/v1/documents/d0c5e1a2-6b7c-4d8e-9f01-a2b3c4d5e6f7/content",
      "headers": {
        "Content-Type": "application/octet-stream"
      },
      "auth": {
        "anyOf": [
          {
            "bearerAuth": {
              "in": "header",
              "name": "Authorization",
              "value": "Bearer test-bearer-token"
            }
          }
        ]
      },
      "body": {
        "bytes": "JVBERi0xLjcK"
      }
    },
    "response": {
      "status": 200,
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "json": {
          "id": "d0c5e1a2-6b7c-4d8e-9f01-a2b3c4d5e6f7",
          "size_bytes": 9
        }
      }
    }
  }
]
`
};
