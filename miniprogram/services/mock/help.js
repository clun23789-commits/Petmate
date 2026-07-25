"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listHelpArticles = listHelpArticles;
exports.listHelpGroups = listHelpGroups;
exports.getHelpArticle = getHelpArticle;
const help_1 = require("../../mocks/data/help");
async function listHelpArticles() {
    return Promise.resolve(help_1.HELP_ARTICLES);
}
async function listHelpGroups() {
    return Promise.resolve(help_1.HELP_GROUPS);
}
async function getHelpArticle(articleId) {
    return Promise.resolve(help_1.HELP_ARTICLES.find((item) => item.id === articleId) || help_1.HELP_ARTICLES[0]);
}
