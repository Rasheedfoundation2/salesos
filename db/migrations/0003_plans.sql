insert into plans(code, name, price_monthly, limits) values
 ('trial', 'Trial', 0, '{"users":10,"contacts":2000,"pipelines":3,"storage_mb":1024,"ai_credits":200,"whatsapp_numbers":1,"email_accounts":2,"automations":5,"api_calls_month":10000}'),
 ('starter', 'Starter', 99, '{"users":5,"contacts":10000,"pipelines":3,"storage_mb":5120,"ai_credits":1000,"whatsapp_numbers":1,"email_accounts":5,"automations":10,"api_calls_month":50000}'),
 ('professional', 'Professional', 299, '{"users":25,"contacts":100000,"pipelines":20,"storage_mb":51200,"ai_credits":10000,"whatsapp_numbers":3,"email_accounts":25,"automations":100,"api_calls_month":500000}'),
 ('enterprise', 'Enterprise', null, '{"users":1000,"contacts":2000000,"pipelines":200,"storage_mb":1048576,"ai_credits":100000,"whatsapp_numbers":20,"email_accounts":1000,"automations":1000,"api_calls_month":10000000}')
on conflict (code) do nothing;
