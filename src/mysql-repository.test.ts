import assert from "node:assert/strict";
import test from "node:test";
import { readMySqlConfig } from "./mysql-repository.js";

test("MySQL configuration accepts Hostinger-style environment variables", () => {
  assert.deepEqual(readMySqlConfig({
    MYSQL_HOST: "localhost",
    MYSQL_PORT: "3306",
    MYSQL_USER: "account_user",
    MYSQL_PASSWORD: "a-secret-password",
    MYSQL_DATABASE: "account_database",
  }), {
    host: "localhost",
    port: 3306,
    user: "account_user",
    password: "a-secret-password",
    database: "account_database",
  });
});

test("MySQL configuration supports the DB_* names from Hostinger documentation", () => {
  assert.equal(readMySqlConfig({
    DB_HOST: "localhost",
    DB_PORT: "3306",
    DB_USER: "account_user",
    DB_PASSWORD: "a-secret-password",
    DB_NAME: "account_database",
  }).database, "account_database");
});

test("MySQL configuration fails closed when credentials are incomplete", () => {
  assert.throws(() => readMySqlConfig({ MYSQL_HOST: "localhost" }), /MYSQL_USER is required/);
  assert.throws(() => readMySqlConfig({
    MYSQL_HOST: "localhost",
    MYSQL_PORT: "not-a-port",
    MYSQL_USER: "user",
    MYSQL_PASSWORD: "password",
    MYSQL_DATABASE: "database",
  }), /MYSQL_PORT/);
});
