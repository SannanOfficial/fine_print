import assert from "node:assert/strict";
import { test } from "node:test";
import { zendeskArticleApi, zendeskArticleHtml } from "./check.ts";

test("zendeskArticleApi maps an article page to its API address", () => {
  assert.equal(
    zendeskArticleApi("https://support.example.com/hc/en-us/articles/360047495654-Provider-Terms"),
    "https://support.example.com/api/v2/help_center/en-us/articles/360047495654.json",
  );
  assert.equal(zendeskArticleApi("https://support.example.com/hc/en-us/sections/12"), null);
  assert.equal(zendeskArticleApi("http://support.example.com/hc/en-us/articles/1"), null);
});

test("zendeskArticleHtml wraps the body like the help-centre page", () => {
  const html = zendeskArticleHtml(JSON.stringify({ article: { body: "<p>Terms</p>" } }));
  assert.match(html ?? "", /<div itemprop="articleBody"><p>Terms<\/p><\/div>/);
  assert.equal(zendeskArticleHtml(JSON.stringify({ article: { body: "  " } })), null);
  assert.equal(zendeskArticleHtml("not json"), null);
});
