import { gql } from "graphql-tag";

export const userTypeDefs = gql`
  input RegisterInput {
    firstName: String!
    lastName: String!
    username: String!
    email: String!
    phoneNumber: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input VerifyInput {
    code: String!
    faPassword: String
  }

  type User {
    id: ID!
    firstName: String!
    lastName: String!
    username: String!
    email: String
    phoneNumber: String!
    password: String
    refreshToken: String
    role: String!
    sessionString: String
    phoneCodeHash: String
  }

  extend type Query {
    me(email: String!): User!
    users: [User]!
    getSessionString: String!
  }

  extend type Mutation {
    registerUser(input: RegisterInput): User!
    registerAdmin(input: RegisterInput): User!
    login(input: LoginInput): User!
    verifyTelegramLogin(input: VerifyInput): User!
    logout: Boolean!
  }
`;
