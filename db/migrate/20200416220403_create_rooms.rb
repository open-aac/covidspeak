class CreateRooms < ActiveRecord::Migration[5.2]
  def change
    create_table :rooms do |t|
      t.integer :account_id
      t.text :settings
      t.datetime :started
      t.datetime :ended
      t.string :code
      t.timestamps
    end
    add_index :rooms, [:code], :unique => true
    add_index :accounts, [:code], :unique => true
  end
end
