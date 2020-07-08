class AddEmailHashToAccounts < ActiveRecord::Migration[5.2]
  def change
    add_column :accounts, :email_hash, :string
    add_index :accounts, [:email_hash]
  end
end
