import { ChatOpenAI } from 'langchain/chat_models/openai';
import { PromptTemplate } from 'langchain/prompts';
import { StringOutputParser } from 'langchain/schema/output_parser';
import { retriever } from './utils/retriever.js';
import { combineDocuments } from './utils/combineDocuments.js';
import { RunnablePassthrough, RunnableSequence } from "langchain/schema/runnable";
import { formatConvHistory } from './utils/formatConvHistory.js';
import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const openAIApiKey = process.env.OPENAI_API_KEY;
const llm = new ChatOpenAI({ openAIApiKey });

const standaloneQuestionTemplate = `Given some conversation history (if any) and a question, convert the question to a standalone question. 
conversation history: {conv_history}
question: {question} 
standalone question:`;
const standaloneQuestionPrompt = PromptTemplate.fromTemplate(standaloneQuestionTemplate);

const answerTemplate = `You are a highly knowledgeable and enthusiastic support bot, dedicated to assisting with questions about the Resume of a student named 'Pranam' based on the provided context and the conversation history. 
    Your responses should be precise, friendly, and professional, reflecting a genuine willingness to help. 
    - When the answer is in the context, provide a clear and concise response. 
    - If the answer is not in the context, search through the conversation history for relevant information. 
    - If the answer is still not found, respond with, 'I'm sorry, I don't know the answer to that.
    - Kindly direct the questioner in a friendly, funny and a creative way to email prxshetty@gmail.com for further assistance. 
    Remember, do not fabricate answers. Always communicate as if you were chatting with a friend, maintaining a warm and approachable tone. 
context: {context}
conversation history: {conv_history}
question: {question}
answer: `;
const answerPrompt = PromptTemplate.fromTemplate(answerTemplate);

const standaloneQuestionChain = standaloneQuestionPrompt
    .pipe(llm)
    .pipe(new StringOutputParser());

const retrieverChain = RunnableSequence.from([
    prevResult => prevResult.standalone_question,
    retriever,
    combineDocuments
]);

const answerChain = answerPrompt
    .pipe(llm)
    .pipe(new StringOutputParser());

const chain = RunnableSequence.from([
    {
        standalone_question: standaloneQuestionChain,
        original_input: new RunnablePassthrough()
    },
    {
        context: retrieverChain,
        question: ({ original_input }) => original_input.question,
        conv_history: ({ original_input }) => original_input.conv_history
    },
    answerChain
]);

const app = express();
app.use(bodyParser.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(__dirname)); // This serves static files from the root directory

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/ask', async (req, res) => {
    const { question, conv_history } = req.body;
    console.log('Received question:', question);
    console.log('Conversation history:', conv_history);

    try {
        const response = await chain.invoke({
            question: question,
            conv_history: formatConvHistory(conv_history)
        });
        console.log('Response:', response);
        res.json({ answer: response });
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
